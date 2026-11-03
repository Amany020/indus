"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import { api } from "@/lib/api";
import {
  User,
  X,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Lock,
  Building,
  MapPin,
  Mail,
  Shield,
  KeyRound,
} from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProfileInfo {
  full_name: string;
  email: string;
  role: string;
  factory_name: string;
  branch_name: string;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const router = useRouter();
  const { logout, user } = useApp();

  const [profileData, setProfileData] = useState<ProfileInfo | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);

  // Fetch real profile from backend when modal is opened
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    let isMounted = true;
    setProfileLoading(true);
    setProfileError(null);

    (async () => {
      try {
        const me = await api.getMe();
        const factories = await api.getFactories();
        const matchedFactory = factories.find((f) => f.id === me.factory_id);
        const factoryName = matchedFactory ? matchedFactory.name : "Primary Plant";

        let branchName = "Main Branch";
        if (me.branch_id && me.factory_id) {
          try {
            const branches = await api.getBranches(me.factory_id);
            const matchedBranch = branches.find((b) => b.id === me.branch_id);
            branchName = matchedBranch ? matchedBranch.name : "Main Branch";
          } catch {
            branchName = "Main Branch";
          }
        }

        if (isMounted) {
          setProfileData({
            full_name: me.full_name || user?.full_name || "Industrial Operator",
            email: me.email || user?.email || "user@industrymind.com",
            role: me.role || user?.role || "worker",
            factory_name: factoryName,
            branch_name: branchName,
          });
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Failed to load profile:", err);
          if (user) {
            setProfileData({
              full_name: user.full_name || "Industrial Operator",
              email: user.email || "user@industrymind.com",
              role: user.role || "worker",
              factory_name: "Primary Plant",
              branch_name: "Main Branch",
            });
          } else {
            setProfileError("Unable to load profile data from server");
          }
        }
      } finally {
        if (isMounted) {
          setProfileLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, user]);

  const handleClose = () => {
    setShowPasswordSection(false);
    setPasswordChangeError(null);
    setPasswordChangeSuccess(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    onClose();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);
    setPasswordChangeSuccess(false);

    if (!currentPassword) {
      setPasswordChangeError("Please enter your current password");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordChangeError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordChangeError("New passwords do not match");
      return;
    }

    setPasswordChangeLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordChangeSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordChangeError(err?.message || "Failed to update password");
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined" && window.confirm("Are you sure you want to log out of IndustryMind?")) {
      logout();
      router.push("/login");
    }
  };

  if (!isOpen) return null;

  const displayRoleLabel = (role: string) => {
    const lower = role.toLowerCase();
    if (lower.includes("admin") || lower.includes("branch_manager") || lower.includes("manager")) {
      return "Branch Manager";
    }
    if (lower.includes("reviewer") || lower.includes("engineer")) {
      return "Reviewer";
    }
    return "Plant Operator";
  };

  const initials = (profileData?.full_name || user?.full_name || "IM")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1C2B29]/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-sm sm:max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#FAF8F5] border border-[#EDE8E0] flex items-center justify-center text-[#D95A2B]">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-[#1C2B29]">
                Profile & Settings
              </h2>
              <p className="text-[11px] text-[#5C6460]">
                Account information and security
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-full text-[#5C6460] hover:text-[#1C2B29] hover:bg-[#FAF8F5] transition"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading Indicator */}
        {profileLoading && (
          <div className="py-6 text-center text-xs text-[#5C6460] flex items-center justify-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#D95A2B] animate-ping" />
            <span>Loading profile details...</span>
          </div>
        )}

        {/* Error Notification */}
        {profileError && (
          <div className="bg-[#FDF2F2] border border-[#F8B4B4] text-[#9B1C1C] text-xs p-3 rounded-2xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{profileError}</span>
          </div>
        )}

        {/* User Card */}
        {profileData && !profileLoading && (
          <div className="space-y-3">
            <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-2xl p-4 flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#1C2B29] text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm text-[#1C2B29] truncate">
                    {profileData.full_name}
                  </h3>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white border border-[#E5E0D8] text-[#D95A2B]">
                    {displayRoleLabel(profileData.role)}
                  </span>
                </div>
                <p className="text-xs text-[#5C6460] truncate flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 shrink-0 text-[#5C6460]" />
                  <span className="truncate">{profileData.email}</span>
                </p>
              </div>
            </div>

            {/* Profile Info Details */}
            <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-2xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#5C6460] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#5C6460]" />
                  System Role
                </span>
                <span className="font-semibold text-[#1C2B29] capitalize">
                  {profileData.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#5C6460] flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-[#5C6460]" />
                  Assigned Factory
                </span>
                <span className="font-semibold text-[#1C2B29]">
                  {profileData.factory_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#5C6460] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#5C6460]" />
                  Operating Branch
                </span>
                <span className="font-semibold text-[#1C2B29]">
                  {profileData.branch_name}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Change Password Section */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowPasswordSection(!showPasswordSection)}
            className="w-full bg-[#FAF8F5] border border-[#EDE8E0] rounded-2xl p-3.5 flex items-center justify-between text-xs font-bold text-[#1C2B29] hover:border-[#D95A2B] transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D95A2B]" />
              <span>Change Password</span>
            </div>
            <ChevronRight
              className={`w-4 h-4 text-[#5C6460] transition-transform ${
                showPasswordSection ? "rotate-90" : ""
              }`}
            />
          </button>

          {showPasswordSection && (
            <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[#5C6460]" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl pl-9 pr-3 py-2 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[#5C6460]" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl pl-9 pr-3 py-2 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[#5C6460]" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    minLength={8}
                    className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl pl-9 pr-3 py-2 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                  />
                </div>
              </div>

              {passwordChangeError && (
                <div className="bg-[#FDF2F2] border border-[#F8B4B4] text-[#9B1C1C] text-xs p-2.5 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordChangeError}</span>
                </div>
              )}

              {passwordChangeSuccess && (
                <div className="bg-[#F3FAF7] border border-[#BCF0DA] text-[#03543F] text-xs p-2.5 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#03543F]" />
                  <span>Password updated successfully</span>
                </div>
              )}

              <button
                type="submit"
                disabled={passwordChangeLoading}
                className="w-full py-2.5 rounded-xl bg-[#D95A2B] hover:bg-[#C84E18] disabled:opacity-50 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {passwordChangeLoading ? "Updating Password..." : "Update Password"}
              </button>
            </form>
          )}
        </div>

        {/* Bottom Log Out Section */}
        <div className="pt-3 border-t border-[#EDE8E0]">
          <button
            type="button"
            onClick={handleLogout}
            title="Log out of IndustryMind"
            className="w-full py-2.5 rounded-xl bg-[#1C2B29] text-white text-xs font-semibold hover:bg-[#9B1C1C] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
