BEGIN;

REVOKE ALL PRIVILEGES
ON TABLE public.attendance_records
FROM PUBLIC, anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.attendance_records
FROM authenticated;

REVOKE TRUNCATE
ON TABLE public.attendance_records
FROM service_role;

DROP POLICY IF EXISTS records_faculty_insert
ON public.attendance_records;

DROP POLICY IF EXISTS records_faculty_update
ON public.attendance_records;

COMMIT;
