import React, { useEffect, useState, useCallback } from 'react';
import { 
  Building2, 
  Users, 
  GraduationCap, 
  BookOpen, 
  ShieldCheck, 
  Plus, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  Search, 
  Layers, 
  AlertCircle 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getAdminOverviewStats, 
  getDepartments, 
  createDepartment, 
  updateDepartment, 
  deleteDepartment,
  getClasses, 
  createClass, 
  updateClass, 
  deleteClass,
  getSubjects, 
  createSubject, 
  updateSubject, 
  deleteSubject 
} from '../../services/adminService';
import type { 
  AdminOverviewStats, 
  Department, 
  AcademicClass, 
  Subject,
  CreateDepartmentInput,
  CreateClassInput,
  CreateSubjectInput 
} from '../../types';
import { DepartmentModal } from '../../components/admin/DepartmentModal';
import { ClassModal } from '../../components/admin/ClassModal';
import { SubjectModal } from '../../components/admin/SubjectModal';
import { ConfirmDeleteModal } from '../../components/admin/ConfirmDeleteModal';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

type AdminTab = 'overview' | 'departments' | 'classes' | 'subjects';

export const AdminDashboard: React.FC = () => {
  const { profile } = useAuth();

  // Active Tab
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Real Database Overview Stats
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Entities Data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Loading States
  const [isDeptsLoading, setIsDeptsLoading] = useState<boolean>(false);
  const [isClassesLoading, setIsClassesLoading] = useState<boolean>(false);
  const [isSubjectsLoading, setIsSubjectsLoading] = useState<boolean>(false);

  // General Action Feedback / Errors
  const [actionError, setActionError] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  // Modal States
  const [isDeptModalOpen, setIsDeptModalOpen] = useState<boolean>(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  const [isClassModalOpen, setIsClassModalOpen] = useState<boolean>(false);
  const [editingClass, setEditingClass] = useState<AcademicClass | null>(null);

  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState<boolean>(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  // Delete Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    title: string;
    itemName: string;
    itemType: string;
    onConfirm: () => Promise<{ success: boolean; error?: string | null }>;
  }>({
    isOpen: false,
    title: '',
    itemName: '',
    itemType: '',
    onConfirm: async () => ({ success: true }),
  });

  // Fetch real overview stats
  const fetchStats = useCallback(async () => {
    setIsStatsLoading(true);
    setStatsError(null);
    const { data, error } = await getAdminOverviewStats();
    if (error) {
      setStatsError(error);
    } else {
      setStats(data);
    }
    setIsStatsLoading(false);
  }, []);

  // Fetch Departments
  const fetchDepartments = useCallback(async () => {
    setIsDeptsLoading(true);
    const { data, error } = await getDepartments();
    if (error) {
      setActionError(error);
    } else {
      setDepartments(data || []);
    }
    setIsDeptsLoading(false);
  }, []);

  // Fetch Classes
  const fetchClasses = useCallback(async () => {
    setIsClassesLoading(true);
    const { data, error } = await getClasses();
    if (error) {
      setActionError(error);
    } else {
      setClasses(data || []);
    }
    setIsClassesLoading(false);
  }, []);

  // Fetch Subjects
  const fetchSubjects = useCallback(async () => {
    setIsSubjectsLoading(true);
    const { data, error } = await getSubjects();
    if (error) {
      setActionError(error);
    } else {
      setSubjects(data || []);
    }
    setIsSubjectsLoading(false);
  }, []);

  // Initial Data Load
  useEffect(() => {
    fetchStats();
    fetchDepartments();
    fetchClasses();
    fetchSubjects();
  }, [fetchStats, fetchDepartments, fetchClasses, fetchSubjects]);

  // Handlers for Department CRUD
  const handleSaveDepartment = async (input: CreateDepartmentInput) => {
    setActionError(null);
    if (editingDept) {
      const { data, error } = await updateDepartment(editingDept.id, input);
      if (error) return { success: false, error };
      setDepartments((prev) => prev.map((d) => (d.id === editingDept.id ? data! : d)));
    } else {
      const { data, error } = await createDepartment(input);
      if (error) return { success: false, error };
      setDepartments((prev) => [...prev, data!].sort((a, b) => a.code.localeCompare(b.code)));
    }
    fetchStats();
    return { success: true };
  };

  const promptDeleteDepartment = (dept: Department) => {
    setDeleteModalState({
      isOpen: true,
      title: 'Delete Academic Department',
      itemName: `[${dept.code}] ${dept.name}`,
      itemType: 'department',
      onConfirm: async () => {
        const res = await deleteDepartment(dept.id);
        if (res.success) {
          setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
          fetchStats();
        }
        return res;
      },
    });
  };

  // Handlers for Class CRUD
  const handleSaveClass = async (input: CreateClassInput) => {
    setActionError(null);
    if (editingClass) {
      const { data, error } = await updateClass(editingClass.id, input);
      if (error) return { success: false, error };
      setClasses((prev) => prev.map((c) => (c.id === editingClass.id ? data! : c)));
    } else {
      const { data, error } = await createClass(input);
      if (error) return { success: false, error };
      setClasses((prev) => [...prev, data!].sort((a, b) => a.name.localeCompare(b.name)));
    }
    fetchStats();
    return { success: true };
  };

  const promptDeleteClass = (cls: AcademicClass) => {
    setDeleteModalState({
      isOpen: true,
      title: 'Delete Class / Section',
      itemName: cls.name,
      itemType: 'class',
      onConfirm: async () => {
        const res = await deleteClass(cls.id);
        if (res.success) {
          setClasses((prev) => prev.filter((c) => c.id !== cls.id));
          fetchStats();
        }
        return res;
      },
    });
  };

  // Handlers for Subject CRUD
  const handleSaveSubject = async (input: CreateSubjectInput) => {
    setActionError(null);
    if (editingSubject) {
      const { data, error } = await updateSubject(editingSubject.id, input);
      if (error) return { success: false, error };
      setSubjects((prev) => prev.map((s) => (s.id === editingSubject.id ? data! : s)));
    } else {
      const { data, error } = await createSubject(input);
      if (error) return { success: false, error };
      setSubjects((prev) => [...prev, data!].sort((a, b) => a.code.localeCompare(b.code)));
    }
    fetchStats();
    return { success: true };
  };

  const promptDeleteSubject = (subj: Subject) => {
    setDeleteModalState({
      isOpen: true,
      title: 'Delete Academic Subject',
      itemName: `[${subj.code}] ${subj.name}`,
      itemType: 'subject',
      onConfirm: async () => {
        const res = await deleteSubject(subj.id);
        if (res.success) {
          setSubjects((prev) => prev.filter((s) => s.id !== subj.id));
          fetchStats();
        }
        return res;
      },
    });
  };

  // Filtered Lists
  const filteredDepartments = departments.filter(
    (d) =>
      d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredClasses = classes.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.academic_year.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === 'all' || c.department_id === deptFilter;
    return matchesSearch && matchesDept;
  });

  const filteredSubjects = subjects.filter((s) => {
    const matchesSearch =
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === 'all' || s.department_id === deptFilter;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header & Welcome Card */}
      <div className="rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50/70 via-white to-blue-50/50 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Full System Administration</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Academic Control Hub — {profile?.full_name || 'Administrator'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Manage departments, classes, subjects, and view live database metrics.
            </p>
          </div>
          <button
            onClick={() => {
              fetchStats();
              fetchDepartments();
              fetchClasses();
              fetchSubjects();
            }}
            disabled={isStatsLoading}
            className="inline-flex items-center gap-2 text-xs text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-xl shadow-xs transition-colors self-start sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-purple-600 ${isStatsLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Database Data</span>
          </button>
        </div>
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Operation Error</p>
              <p className="mt-0.5">{actionError}</p>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-xs text-red-600 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 2. Real-Time Overview Metrics Bar */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Live Database Metrics
          </h3>
          {statsError && (
            <span className="text-xs text-amber-600 font-medium">Notice: {statsError}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {/* Total Students */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Students</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <GraduationCap className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {isStatsLoading ? '—' : stats?.totalStudents ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Enrolled Students</p>
          </div>

          {/* Total Faculty */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Faculty</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {isStatsLoading ? '—' : stats?.totalFaculty ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Teaching Staff</p>
          </div>

          {/* Total Departments */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Departments</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {isStatsLoading ? '—' : stats?.totalDepartments ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Academic Units</p>
          </div>

          {/* Total Classes */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Active Classes</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {isStatsLoading ? '—' : stats?.totalClasses ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Cohorts & Sections</p>
          </div>

          {/* Total Subjects */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Curriculum Subjects</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <BookOpen className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {isStatsLoading ? '—' : stats?.totalSubjects ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Active Courses</p>
          </div>
        </div>
      </div>

      {/* 3. Segmented Navigation Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => {
              setActiveTab('overview');
              setSearchQuery('');
            }}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'overview'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Overview & Quick Actions
          </button>
          <button
            onClick={() => {
              setActiveTab('departments');
              setSearchQuery('');
            }}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'departments'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Departments ({departments.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('classes');
              setSearchQuery('');
            }}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'classes'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Classes & Sections ({classes.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('subjects');
              setSearchQuery('');
            }}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'subjects'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Subjects & Credits ({subjects.length})
          </button>
        </nav>
      </div>

      {/* 4. Tab 1: Overview & Quick Actions */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Departments Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {departments.length} Listed
                </span>
              </div>
              <h4 className="mt-4 text-base font-bold text-slate-900">Department Management</h4>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Add, inspect or modify academic departments and departmental codes.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingDept(null);
                    setIsDeptModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Department</span>
                </button>
                <button
                  onClick={() => setActiveTab('departments')}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  View All
                </button>
              </div>
            </div>

            {/* Classes Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Layers className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-slate-400">{classes.length} Listed</span>
              </div>
              <h4 className="mt-4 text-base font-bold text-slate-900">Class & Section Rosters</h4>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Configure student cohorts, semester levels, and academic year assignments.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={() => {
                    if (departments.length === 0) {
                      setActionError('Create at least one Department before creating a Class.');
                      return;
                    }
                    setEditingClass(null);
                    setIsClassModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Class</span>
                </button>
                <button
                  onClick={() => setActiveTab('classes')}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  View All
                </button>
              </div>
            </div>

            {/* Subjects Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <BookOpen className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-slate-400">{subjects.length} Listed</span>
              </div>
              <h4 className="mt-4 text-base font-bold text-slate-900">Curriculum Subjects</h4>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Define subject codes, course credit weights, and offering department links.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={() => {
                    if (departments.length === 0) {
                      setActionError('Create at least one Department before creating a Subject.');
                      return;
                    }
                    setEditingSubject(null);
                    setIsSubjectModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Subject</span>
                </button>
                <button
                  onClick={() => setActiveTab('subjects')}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  View All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Department Management */}
      {activeTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search departments by code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>
            <button
              onClick={() => {
                setEditingDept(null);
                setIsDeptModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add Department</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {isDeptsLoading ? (
              <LoadingSpinner size="md" message="Loading academic departments..." />
            ) : filteredDepartments.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-700">No departments found</p>
                <p className="mt-1 text-xs text-slate-400">
                  {searchQuery ? 'No departments match your search.' : 'Get started by creating your first department.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Code</th>
                      <th className="px-6 py-3">Department Name</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDepartments.map((dept) => (
                      <tr key={dept.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-3.5 font-mono font-bold text-purple-700">
                          {dept.code}
                        </td>
                        <td className="px-6 py-3.5 font-medium text-slate-900">
                          {dept.name}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingDept(dept);
                                setIsDeptModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-purple-600 transition-colors"
                              title="Edit Department"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => promptDeleteDepartment(dept)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete Department"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Tab 3: Class Management */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 max-w-lg">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search classes by name or year..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                />
              </div>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-purple-600 focus:outline-none"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (departments.length === 0) {
                  setActionError('Create at least one Department before creating a Class.');
                  return;
                }
                setEditingClass(null);
                setIsClassModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add Class</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {isClassesLoading ? (
              <LoadingSpinner size="md" message="Loading academic classes..." />
            ) : filteredClasses.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Layers className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-700">No classes found</p>
                <p className="mt-1 text-xs text-slate-400">
                  {searchQuery ? 'No classes match your search query.' : 'Get started by creating your first class/section.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Class Name</th>
                      <th className="px-6 py-3">Department</th>
                      <th className="px-6 py-3">Academic Year</th>
                      <th className="px-6 py-3">Semester</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredClasses.map((cls) => (
                      <tr key={cls.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-slate-900">{cls.name}</td>
                        <td className="px-6 py-3.5">
                          <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">
                            {cls.department?.code || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 font-mono text-slate-600">{cls.academic_year}</td>
                        <td className="px-6 py-3.5">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            Sem {cls.semester}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingClass(cls);
                                setIsClassModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-purple-600 transition-colors"
                              title="Edit Class"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => promptDeleteClass(cls)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete Class"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Tab 4: Subject Management */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 max-w-lg">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search subjects by code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                />
              </div>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-purple-600 focus:outline-none"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (departments.length === 0) {
                  setActionError('Create at least one Department before creating a Subject.');
                  return;
                }
                setEditingSubject(null);
                setIsSubjectModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add Subject</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {isSubjectsLoading ? (
              <LoadingSpinner size="md" message="Loading curriculum subjects..." />
            ) : filteredSubjects.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-700">No subjects found</p>
                <p className="mt-1 text-xs text-slate-400">
                  {searchQuery ? 'No subjects match your search.' : 'Get started by creating your first subject course.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Code</th>
                      <th className="px-6 py-3">Subject Name</th>
                      <th className="px-6 py-3">Department</th>
                      <th className="px-6 py-3">Credits</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSubjects.map((subj) => (
                      <tr key={subj.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-3.5 font-mono font-bold text-purple-700">{subj.code}</td>
                        <td className="px-6 py-3.5 font-medium text-slate-900">{subj.name}</td>
                        <td className="px-6 py-3.5">
                          <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">
                            {subj.department?.code || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 font-medium text-slate-700">
                          {subj.credits} Credits
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingSubject(subj);
                                setIsSubjectModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-purple-600 transition-colors"
                              title="Edit Subject"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => promptDeleteSubject(subj)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete Subject"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <DepartmentModal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        onSave={handleSaveDepartment}
        department={editingDept}
      />

      <ClassModal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        onSave={handleSaveClass}
        departments={departments}
        academicClass={editingClass}
      />

      <SubjectModal
        isOpen={isSubjectModalOpen}
        onClose={() => setIsSubjectModalOpen(false)}
        onSave={handleSaveSubject}
        departments={departments}
        subject={editingSubject}
      />

      <ConfirmDeleteModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.title}
        itemName={deleteModalState.itemName}
        itemType={deleteModalState.itemType}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModalState.onConfirm}
      />
    </div>
  );
};
