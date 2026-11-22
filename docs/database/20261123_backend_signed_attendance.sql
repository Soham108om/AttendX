BEGIN;

DO $preflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_extension extension_row
        JOIN pg_namespace extension_schema
          ON extension_schema.oid = extension_row.extnamespace
        WHERE extension_row.extname = 'pgcrypto'
          AND extension_schema.nspname = 'extensions'
    ) OR to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL THEN
        RAISE EXCEPTION 'AttendX verified attendance requires pgcrypto hmac(bytea,bytea,text) in schema extensions.';
    END IF;

    IF to_regclass('vault.decrypted_secrets') IS NULL THEN
        RAISE EXCEPTION 'AttendX verified attendance requires Supabase Vault view vault.decrypted_secrets.';
    END IF;
END;
$preflight$;

CREATE SCHEMA IF NOT EXISTS attendx_private AUTHORIZATION postgres;
ALTER SCHEMA attendx_private OWNER TO postgres;
REVOKE ALL ON SCHEMA attendx_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS attendx_private.attendance_match_nonces (
    nonce uuid PRIMARY KEY,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

REVOKE ALL ON TABLE attendx_private.attendance_match_nonces
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL PRIVILEGES
ON TABLE public.attendance_records
FROM PUBLIC, anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.attendance_records
FROM authenticated, service_role;

DROP POLICY IF EXISTS records_faculty_insert
ON public.attendance_records;

DROP POLICY IF EXISTS records_faculty_update
ON public.attendance_records;

REVOKE ALL ON TABLE vault.decrypted_secrets
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_record_verified_attendance(
    p_student_id uuid,
    p_session_id uuid,
    p_issued_at timestamptz,
    p_expires_at timestamptz,
    p_nonce uuid,
    p_signature text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $function$
DECLARE
    v_caller_id uuid;
    v_now timestamptz := clock_timestamp();
    v_issued_at_ms bigint;
    v_expires_at_ms bigint;
    v_payload text;
    v_secret text;
    v_expected_signature bytea;
    v_provided_signature bytea;
    v_signature_diff integer := 0;
    v_index integer;
    v_student_class_id uuid;
    v_student_face_enrolled boolean;
    v_session_class_id uuid;
    v_session_status public.session_status_type;
    v_assignment_active boolean;
    v_existing_attendance_status public.attendance_status_type;
    v_consent_given boolean;
    v_revoked_at timestamptz;
    v_embedding_count integer;
    v_distinct_sample_count integer;
    v_min_sample_index integer;
    v_max_sample_index integer;
    v_enrollment_valid boolean;
    v_inserted_count integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL
       OR v_caller_id IS DISTINCT FROM p_student_id
       OR public.fn_get_my_role() IS DISTINCT FROM 'student'::public.user_role_type THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT403',
            MESSAGE = 'Attendance verification is not authorized.';
    END IF;

    IF p_nonce IS NULL
       OR p_session_id IS NULL
       OR p_issued_at IS NULL
       OR p_expires_at IS NULL
       OR p_signature IS NULL
       OR p_signature !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT401',
            MESSAGE = 'Attendance attestation is invalid or expired.';
    END IF;

    v_issued_at_ms := floor(extract(epoch FROM p_issued_at) * 1000)::bigint;
    v_expires_at_ms := floor(extract(epoch FROM p_expires_at) * 1000)::bigint;
    IF v_expires_at_ms - v_issued_at_ms <> 60000
       OR p_issued_at > v_now + interval '30 seconds'
       OR p_expires_at <= v_now THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT401',
            MESSAGE = 'Attendance attestation is invalid or expired.';
    END IF;

    SELECT secret_row.decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets AS secret_row
    WHERE secret_row.name = 'attendx_attendance_attestation_hmac_v1'
    LIMIT 1;

    IF v_secret IS NULL OR octet_length(convert_to(v_secret, 'UTF8')) < 32 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT503',
            MESSAGE = 'Attendance verification is not configured.';
    END IF;

    v_payload := concat_ws(
        E'\n',
        p_student_id::text,
        p_session_id::text,
        v_issued_at_ms::text,
        v_expires_at_ms::text,
        p_nonce::text
    );
    v_expected_signature := extensions.hmac(
        convert_to(v_payload, 'UTF8'),
        convert_to(v_secret, 'UTF8'),
        'sha256'
    );
    v_provided_signature := decode(p_signature, 'hex');
    IF octet_length(v_provided_signature) <> 32 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT401',
            MESSAGE = 'Attendance attestation is invalid or expired.';
    END IF;

    FOR v_index IN 0..31 LOOP
        v_signature_diff := v_signature_diff
            | (get_byte(v_expected_signature, v_index) # get_byte(v_provided_signature, v_index));
    END LOOP;
    IF v_signature_diff <> 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT401',
            MESSAGE = 'Attendance attestation is invalid or expired.';
    END IF;

    SELECT student_row.class_id, student_row.face_enrolled
    INTO v_student_class_id, v_student_face_enrolled
    FROM public.students AS student_row
    WHERE student_row.id = v_caller_id
    FOR SHARE;

    IF NOT FOUND OR v_student_class_id IS NULL OR v_student_face_enrolled IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT403',
            MESSAGE = 'Student is not eligible for attendance verification.';
    END IF;

    SELECT consent_row.consent_given, consent_row.revoked_at
    INTO v_consent_given, v_revoked_at
    FROM public.biometric_consents AS consent_row
    WHERE consent_row.student_id = v_caller_id
    FOR SHARE;

    IF NOT FOUND OR v_consent_given IS DISTINCT FROM true OR v_revoked_at IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT403',
            MESSAGE = 'Active biometric consent is required.';
    END IF;

    SELECT
        count(*)::integer,
        count(DISTINCT embedding_row.sample_index)::integer,
        min(embedding_row.sample_index),
        max(embedding_row.sample_index),
        coalesce(bool_and(
            embedding_row.is_active IS TRUE
            AND embedding_row.model_version = 'sface_2021dec'
            AND embedding_row.quality_score IS NOT NULL
            AND embedding_row.quality_score BETWEEN 0.9 AND 1.0
        ), false)
    INTO
        v_embedding_count,
        v_distinct_sample_count,
        v_min_sample_index,
        v_max_sample_index,
        v_enrollment_valid
    FROM public.face_embeddings AS embedding_row
    WHERE embedding_row.student_id = v_caller_id;

    IF v_embedding_count <> 5
       OR v_distinct_sample_count <> 5
       OR v_min_sample_index <> 1
       OR v_max_sample_index <> 5
       OR NOT v_enrollment_valid THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT403',
            MESSAGE = 'A complete active face enrolment is required.';
    END IF;

    SELECT session_row.status, assignment_row.class_id, assignment_row.is_active
    INTO v_session_status, v_session_class_id, v_assignment_active
    FROM public.attendance_sessions AS session_row
    JOIN public.faculty_subject_assignments AS assignment_row
      ON assignment_row.id = session_row.assignment_id
    WHERE session_row.id = p_session_id
    FOR SHARE OF session_row, assignment_row;

    IF NOT FOUND
       OR v_session_status IS DISTINCT FROM 'active_scanning'::public.session_status_type
       OR v_assignment_active IS DISTINCT FROM true
       OR v_session_class_id IS DISTINCT FROM v_student_class_id THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT403',
            MESSAGE = 'Attendance session is inactive or unavailable to this student.';
    END IF;

    DELETE FROM attendx_private.attendance_match_nonces
    WHERE expires_at <= v_now;

    INSERT INTO attendx_private.attendance_match_nonces (
        nonce,
        expires_at
    )
    VALUES (p_nonce, p_expires_at)
    ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    IF v_inserted_count = 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'PT409',
            MESSAGE = 'Attendance attestation has already been used.';
    END IF;

    SELECT record_row.status
    INTO v_existing_attendance_status
    FROM public.attendance_records AS record_row
    WHERE record_row.session_id = p_session_id
      AND record_row.student_id = v_caller_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'already_recorded',
            'session_id', p_session_id,
            'attendance_status', v_existing_attendance_status::text
        );
    END IF;

    INSERT INTO public.attendance_records (
        session_id,
        student_id,
        status
    )
    VALUES (
        p_session_id,
        v_caller_id,
        'present'::public.attendance_status_type
    )
    ON CONFLICT (session_id, student_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    IF v_inserted_count = 0 THEN
        SELECT record_row.status
        INTO v_existing_attendance_status
        FROM public.attendance_records AS record_row
        WHERE record_row.session_id = p_session_id
          AND record_row.student_id = v_caller_id;

        RETURN jsonb_build_object(
            'status', 'already_recorded',
            'session_id', p_session_id,
            'attendance_status', v_existing_attendance_status::text
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'recorded',
        'session_id', p_session_id,
        'attendance_status', 'present'
    );
END;
$function$;

ALTER FUNCTION public.fn_record_verified_attendance(
    uuid,
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.fn_record_verified_attendance(
    uuid,
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    text
) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.fn_record_verified_attendance(
    uuid,
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    text
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
