"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

interface User {
  id: string;
  username: string;
  bio: string;
  avatar: string;
  realName?: string;
  classId?: string;
  verified?: boolean;
  disabled?: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface Stats {
  total: number;
  active: number;
  disabled: number;
  verified: number;
}

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function UsersAdminPage() {
  const { user, authFetch } = useAuth();
  const { language } = useLanguage();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, disabled: 0, verified: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 新增/编辑表单
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    bio: "",
    realName: "",
    classId: "",
    verified: false,
    disabled: false,
  });

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    if (isUserAdmin) fetchUsers();
  }, [statusFilter, pagination.page]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (searchKeyword) params.append("search", searchKeyword);
      params.append("page", pagination.page.toString());

      const response = await authFetch(`/api/admin/users?${params.toString()}`);
      const data = await response.json();
      setUsers(data.users || []);
      setStats(data.stats || stats);
      setPagination(data.pagination || pagination);
    } catch (error) {
      console.error("获取用户列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPagination(p => ({ ...p, page: 1 }));
    fetchUsers();
  };

  const resetForm = () => {
    setFormData({
      username: "",
      password: "",
      bio: "",
      realName: "",
      classId: "",
      verified: false,
      disabled: false,
    });
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (user: User) => {
    setFormData({
      username: user.username,
      password: "",
      bio: user.bio || "",
      realName: user.realName || "",
      classId: user.classId || "",
      verified: user.verified || false,
      disabled: user.disabled || false,
    });
    setSelectedUser(user);
  };

  const handleAddUser = async () => {
    if (!formData.username || !formData.password) {
      alert(language === "zh" ? "用户名和密码不能为空" : "Username and password required");
      return;
    }

    setProcessing(true);
    try {
      const response = await authFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (response.ok) {
        setShowAddModal(false);
        resetForm();
        fetchUsers();
      } else {
        alert(data.error || (language === "zh" ? "创建失败" : "Failed to create"));
      }
    } catch (error) {
      console.error("创建用户失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    setProcessing(true);
    try {
      const updateData: Record<string, unknown> = { ...formData };
      if (!updateData.password) delete updateData.password;

      const response = await authFetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });

      const data = await response.json();
      if (response.ok) {
        setSelectedUser(null);
        resetForm();
        fetchUsers();
      } else {
        alert(data.error || (language === "zh" ? "更新失败" : "Failed to update"));
      }
    } catch (error) {
      console.error("更新用户失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleStatus = async (user: User, field: "verified" | "disabled") => {
    setProcessing(true);
    try {
      const response = await authFetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ [field]: !user[field] }),
      });

      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("更新状态失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(language === "zh"
      ? `确定要删除用户 "${user.username}" 吗？此操作不可恢复。`
      : `Delete user "${user.username}"? This cannot be undone.`)) return;

    setProcessing(true);
    try {
      const response = await authFetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSelectedUser(null);
        fetchUsers();
      }
    } catch (error) {
      console.error("删除用户失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  if (!isUserAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{language === "zh" ? "无权限访问此页面" : "Access denied"}</p>
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
          {language === "zh" ? "返回首页" : "Home"}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-blue-600 hover:underline">
          ← {language === "zh" ? "返回管理后台" : "Back to Admin"}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">
          👥 {language === "zh" ? "用户管理" : "User Management"}
        </h1>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + {language === "zh" ? "新增用户" : "Add User"}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div
          className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow ${statusFilter === "all" ? "ring-2 ring-blue-500" : ""}`}
          onClick={() => { setStatusFilter("all"); setPagination(p => ({ ...p, page: 1 })); }}
        >
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "全部用户" : "All Users"}</div>
        </div>
        <div
          className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow ${statusFilter === "active" ? "ring-2 ring-green-500" : ""}`}
          onClick={() => { setStatusFilter("active"); setPagination(p => ({ ...p, page: 1 })); }}
        >
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "正常用户" : "Active"}</div>
        </div>
        <div
          className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow ${statusFilter === "disabled" ? "ring-2 ring-red-500" : ""}`}
          onClick={() => { setStatusFilter("disabled"); setPagination(p => ({ ...p, page: 1 })); }}
        >
          <div className="text-2xl font-bold text-red-600">{stats.disabled}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已禁用" : "Disabled"}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{stats.verified}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已认证" : "Verified"}</div>
        </div>
      </div>

      {/* 搜索 */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 mb-6">
        <div className="flex gap-4">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={language === "zh" ? "搜索用户名、姓名或班级..." : "Search username, name or class..."}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            {language === "zh" ? "搜索" : "Search"}
          </button>
        </div>
      </div>

      {/* 用户列表 */}
      {loading ? (
        <p className="text-center text-gray-500">{language === "zh" ? "加载中..." : "Loading..."}</p>
      ) : users.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          {language === "zh" ? "暂无用户" : "No users found"}
        </p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className={`bg-white dark:bg-gray-800 border rounded-lg p-4 hover:shadow-lg cursor-pointer transition-shadow ${u.disabled ? "opacity-60" : ""}`}
              onClick={() => openEditModal(u)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      u.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{u.username}</span>
                      {u.verified && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          {language === "zh" ? "已认证" : "Verified"}
                        </span>
                      )}
                      {u.disabled && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                          {language === "zh" ? "已禁用" : "Disabled"}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {u.realName && <span className="mr-3">{u.realName}</span>}
                      {u.classId && <span className="mr-3">{u.classId}</span>}
                      <span>{new Date(u.createdAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleToggleStatus(u, "disabled")}
                    className={`px-3 py-1 rounded text-sm ${
                      u.disabled
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-red-100 text-red-700 hover:bg-red-200"
                    }`}
                    disabled={processing}
                  >
                    {u.disabled
                      ? (language === "zh" ? "启用" : "Enable")
                      : (language === "zh" ? "禁用" : "Disable")}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                disabled={pagination.page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                {language === "zh" ? "上一页" : "Previous"}
              </button>
              <span className="px-4 py-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(p => ({ ...p, page: Math.min(pagination.totalPages, p.page + 1) }))}
                disabled={pagination.page === pagination.totalPages}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                {language === "zh" ? "下一页" : "Next"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 新增用户弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  {language === "zh" ? "新增用户" : "Add User"}
                </h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "用户名 *" : "Username *"}
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "密码 *" : "Password *"}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "真实姓名" : "Real Name"}
                  </label>
                  <input
                    type="text"
                    value={formData.realName}
                    onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "班级" : "Class"}
                  </label>
                  <input
                    type="text"
                    value={formData.classId}
                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "简介" : "Bio"}
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.verified}
                      onChange={(e) => setFormData({ ...formData, verified: e.target.checked })}
                    />
                    <span className="text-sm">{language === "zh" ? "已认证" : "Verified"}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.disabled}
                      onChange={(e) => setFormData({ ...formData, disabled: e.target.checked })}
                    />
                    <span className="text-sm">{language === "zh" ? "禁用" : "Disabled"}</span>
                  </label>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <button
                    onClick={handleAddUser}
                    disabled={processing}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {language === "zh" ? "创建" : "Create"}
                  </button>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    {language === "zh" ? "取消" : "Cancel"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑用户弹窗 */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  {language === "zh" ? "编辑用户" : "Edit User"}
                </h2>
                <button
                  onClick={() => { setSelectedUser(null); resetForm(); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "用户名" : "Username"}
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "新密码 (留空不修改)" : "New Password (leave empty to keep)"}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                    placeholder={language === "zh" ? "留空则不修改密码" : "Leave empty to keep current"}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "真实姓名" : "Real Name"}
                  </label>
                  <input
                    type="text"
                    value={formData.realName}
                    onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "班级" : "Class"}
                  </label>
                  <input
                    type="text"
                    value={formData.classId}
                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {language === "zh" ? "简介" : "Bio"}
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                  />
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.verified}
                      onChange={(e) => setFormData({ ...formData, verified: e.target.checked })}
                    />
                    <span className="text-sm">{language === "zh" ? "已认证" : "Verified"}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.disabled}
                      onChange={(e) => setFormData({ ...formData, disabled: e.target.checked })}
                    />
                    <span className="text-sm">{language === "zh" ? "禁用" : "Disabled"}</span>
                  </label>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <button
                    onClick={handleUpdateUser}
                    disabled={processing}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {language === "zh" ? "保存" : "Save"}
                  </button>
                  <button
                    onClick={() => handleDelete(selectedUser)}
                    disabled={processing}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {language === "zh" ? "删除" : "Delete"}
                  </button>
                  <button
                    onClick={() => { setSelectedUser(null); resetForm(); }}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    {language === "zh" ? "取消" : "Cancel"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
