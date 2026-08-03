"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Copy,
  Crown,
  DatabaseBackup,
  DoorOpen,
  House,
  KeyRound,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  deleteHouseholdAction,
  leaveHouseholdAction,
  renameHouseholdAction,
  transferOwnershipAction,
  updateProfileNameAction,
} from "@/app/(app)/profile/actions";
import { PageHeader } from "@/components/app/page-header";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { getInitials } from "@/lib/auth/display";
import { initialProfileActionState } from "@/lib/profile/action-state";
import type { HouseholdMemberView } from "@/lib/profile/data";

type HouseholdView = {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string | null;
};

type Editor = "profile" | "household" | "transfer" | "leave" | "delete" | null;

export function ProfileManager({
  email,
  household,
  members,
  profileName,
  userId,
}: {
  email: string;
  household: HouseholdView;
  members: HouseholdMemberView[];
  profileName: string;
  userId: string;
}) {
  const [editor, setEditor] = useState<Editor>(null);
  const { notify } = useToast();
  const isOwner = household.ownerId === userId;
  const transferCandidates = members.filter((member) => member.id !== userId);

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      notify("Đã sao chép mã mời.");
    } catch {
      notify("Không thể sao chép tự động. Hãy nhấn giữ mã mời để sao chép.", "error");
    }
  };

  return (
    <>
      <PageHeader
        description="Cập nhật thông tin cá nhân, thành viên và quyền quản trị household đang dùng dữ liệu Supabase thật."
        eyebrow="Tài khoản và gia đình"
        title="Cá nhân"
      />

      <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-4">
          <Card className="h-fit">
            <CardContent className="flex flex-col items-center p-6 text-center sm:p-8">
              <div className="grid size-24 place-items-center rounded-full bg-forest text-2xl font-extrabold text-paper shadow-[0_18px_45px_rgba(31,61,43,0.22)]">
                {getInitials(profileName)}
              </div>
              <h2 className="mt-5 text-2xl font-extrabold tracking-[-0.04em]">{profileName}</h2>
              <p className="mt-1 text-sm font-medium text-ink/46">{email}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-yellow px-3 py-1.5 text-xs font-extrabold text-ink">
                {isOwner ? <Crown aria-hidden="true" className="size-3.5" /> : <UserRound aria-hidden="true" className="size-3.5" />}
                {isOwner ? "Chủ household" : "Thành viên"}
              </span>
              <Button className="mt-5 w-full" onClick={() => setEditor("profile")} variant="secondary">
                <Pencil aria-hidden="true" className="size-4" /> Sửa tên hiển thị
              </Button>
            </CardContent>
          </Card>
          <LogoutButton />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo">Household</p>
                <h2 className="mt-1 text-xl font-extrabold">{household.name}</h2>
              </div>
              {isOwner ? (
                <Button aria-label="Đổi tên household" onClick={() => setEditor("household")} size="icon" variant="ghost">
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2">
              <ProfileRow icon={House} label="Tên household" value={household.name} />
              <div className="flex items-center gap-2 rounded-2xl bg-white/58 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mist text-forest"><KeyRound aria-hidden="true" className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-ink/42">Mã mời</span><span className="mt-0.5 block select-all truncate text-sm font-extrabold tracking-[0.12em]">{household.inviteCode}</span></span>
                <Button aria-label="Sao chép mã mời" onClick={copyInviteCode} size="icon" variant="ghost"><Copy aria-hidden="true" className="size-4" /></Button>
              </div>
              <ProfileRow icon={ShieldCheck} label="Quyền của bạn" value={isOwner ? "Chủ household" : "Thành viên"} />
              <ProfileRow icon={Mail} label="Email đăng nhập" value={email} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-forest/42">Thành viên</p><h2 className="mt-1 text-xl font-extrabold">{members.length} người</h2></div>
              {isOwner && transferCandidates.length > 0 ? <Button onClick={() => setEditor("transfer")} size="sm" variant="secondary"><Crown aria-hidden="true" className="size-4" /> Chuyển chủ</Button> : null}
            </CardHeader>
            <CardContent className="space-y-2">
              {members.map((member) => <MemberRow key={member.id} member={member} />)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-income">Dữ liệu của bạn</p><h2 className="mt-1 text-xl font-extrabold">Sao lưu và khôi phục</h2></CardHeader>
            <CardContent>
              <Link className="flex min-h-16 items-center gap-3 rounded-2xl bg-mint-soft/72 p-4 text-forest transition hover:bg-mint-soft" href="/backup">
                <DatabaseBackup aria-hidden="true" className="size-6 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">Xuất hoặc nhập giao dịch</span><span className="mt-1 block text-xs font-semibold leading-5 text-forest/58">Tải JSON/CSV về thiết bị, xem trước trước khi khôi phục.</span></span>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-expense/20">
            <CardHeader><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-expense">Khu vực nguy hiểm</p><h2 className="mt-1 text-xl font-extrabold">Quản lý tư cách thành viên</h2></CardHeader>
            <CardContent>
              {isOwner ? (
                <div className="rounded-2xl bg-rose/18 p-4"><p className="text-sm font-bold text-ink">Xóa toàn bộ household</p><p className="mt-1 text-xs font-medium leading-5 text-ink/52">Xóa vĩnh viễn giao dịch, danh mục và ngân sách chung. Tài khoản thành viên không bị xóa.</p><Button className="mt-4 w-full" onClick={() => setEditor("delete")} variant="danger"><Trash2 aria-hidden="true" className="size-4" /> Xóa household</Button></div>
              ) : (
                <div className="rounded-2xl bg-mist/65 p-4"><p className="text-sm font-bold text-ink">Rời household</p><p className="mt-1 text-xs font-medium leading-5 text-ink/52">Bạn sẽ không còn thấy dữ liệu chung, nhưng giao dịch lịch sử của household vẫn được giữ.</p><Button className="mt-4 w-full" onClick={() => setEditor("leave")} variant="secondary"><DoorOpen aria-hidden="true" className="size-4" /> Rời household</Button></div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {editor === "profile" ? <ProfileNameSheet currentName={profileName} onClose={() => setEditor(null)} /> : null}
      {editor === "household" ? <HouseholdNameSheet currentName={household.name} onClose={() => setEditor(null)} /> : null}
      {editor === "transfer" ? <TransferOwnershipSheet members={transferCandidates} onClose={() => setEditor(null)} /> : null}
      {editor === "leave" ? <LeaveHouseholdSheet householdName={household.name} onClose={() => setEditor(null)} /> : null}
      {editor === "delete" ? <DeleteHouseholdSheet householdName={household.name} onClose={() => setEditor(null)} /> : null}
    </>
  );
}

function ProfileRow({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return <div className="flex w-full items-center gap-3 rounded-2xl bg-white/58 p-3 text-left"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mist text-forest"><Icon aria-hidden="true" className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-ink/42">{label}</span><span className="mt-0.5 block truncate text-sm font-extrabold">{value}</span></span></div>;
}

function MemberRow({ member }: { member: HouseholdMemberView }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-white/58 p-3"><span className={`grid size-11 shrink-0 place-items-center rounded-full text-xs font-extrabold ${member.isOwner ? "bg-yellow text-ink" : "bg-forest text-paper"}`}>{getInitials(member.name)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold">{member.name}{member.isCurrentUser ? " · Bạn" : ""}</span><span className="mt-0.5 block truncate text-xs font-medium text-ink/42">{member.email || (member.isOwner ? "Chủ household" : "Thành viên")}</span></span>{member.isOwner ? <Crown aria-label="Chủ household" className="size-4 shrink-0 text-forest" /> : <UsersRound aria-hidden="true" className="size-4 shrink-0 text-ink/25" />}</div>;
}

function ProfileNameSheet({ currentName, onClose }: { currentName: string; onClose: () => void }) {
  return <SimpleTextSheet action={updateProfileNameAction} fieldName="fullName" initialValue={currentName} label="Tên hiển thị" onClose={onClose} title="Sửa tên hiển thị" />;
}

function HouseholdNameSheet({ currentName, onClose }: { currentName: string; onClose: () => void }) {
  return <SimpleTextSheet action={renameHouseholdAction} fieldName="householdName" initialValue={currentName} label="Tên household" onClose={onClose} title="Đổi tên household" />;
}

function SimpleTextSheet({ action, fieldName, initialValue, label, onClose, title }: { action: typeof updateProfileNameAction; fieldName: "fullName" | "householdName"; initialValue: string; label: string; onClose: () => void; title: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [state, formAction, pending] = useActionState(action, initialProfileActionState);
  useEffect(() => { if (state.status === "success") { notify(state.message ?? "Đã lưu thay đổi."); router.refresh(); onClose(); } }, [notify, onClose, router, state.message, state.status]);
  const error = fieldName === "fullName" ? state.fieldErrors?.fullName : state.fieldErrors?.householdName;
  return <Sheet closeLabel="Đóng biểu mẫu" description="Thay đổi được đồng bộ với household hiện tại." onClose={pending ? () => undefined : onClose} open title={title}><form action={formAction} className="grid gap-4">{state.status === "error" && state.message ? <AuthFeedback message={state.message} /> : null}<Input defaultValue={initialValue} disabled={pending} error={error} label={label} maxLength={fieldName === "fullName" ? 50 : 60} name={fieldName} required /><div className="grid grid-cols-[0.72fr_1.28fr] gap-3"><Button disabled={pending} onClick={onClose} type="button" variant="secondary">Hủy</Button><Button disabled={pending} type="submit">{pending ? "Đang lưu..." : "Lưu thay đổi"}</Button></div></form></Sheet>;
}

function TransferOwnershipSheet({ members, onClose }: { members: HouseholdMemberView[]; onClose: () => void }) {
  const router = useRouter();
  const { notify } = useToast();
  const [state, formAction, pending] = useActionState(transferOwnershipAction, initialProfileActionState);
  useEffect(() => { if (state.status === "success") { notify(state.message ?? "Đã chuyển quyền."); router.refresh(); onClose(); } }, [notify, onClose, router, state.message, state.status]);
  return <Sheet closeLabel="Đóng chuyển quyền" description="Sau khi chuyển, bạn trở thành thành viên và chủ mới có quyền quản trị household." onClose={pending ? () => undefined : onClose} open title="Chuyển quyền chủ household"><form action={formAction} className="grid gap-4">{state.status === "error" && state.message ? <AuthFeedback message={state.message} /> : null}<Select disabled={pending} error={state.fieldErrors?.newOwnerId} label="Chủ household mới" name="newOwnerId" required>{members.map((member) => <option key={member.id} value={member.id}>{member.name}{member.email ? ` · ${member.email}` : ""}</option>)}</Select><div className="rounded-2xl bg-yellow/35 p-4 text-sm font-semibold leading-6 text-ink">Hãy xác nhận với thành viên được chọn trước khi chuyển quyền. Thao tác có hiệu lực ngay.</div><div className="grid grid-cols-[0.72fr_1.28fr] gap-3"><Button disabled={pending} onClick={onClose} type="button" variant="secondary">Hủy</Button><Button disabled={pending || members.length === 0} type="submit">{pending ? "Đang chuyển..." : "Xác nhận chuyển quyền"}</Button></div></form></Sheet>;
}

function LeaveHouseholdSheet({ householdName, onClose }: { householdName: string; onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(leaveHouseholdAction, initialProfileActionState);
  useEffect(() => { if (state.status === "success") { router.replace("/onboarding"); router.refresh(); } }, [router, state.status]);
  return <Sheet closeLabel="Đóng xác nhận rời household" description={`Bạn sẽ rời "${householdName}" và không còn thấy dữ liệu thu chi chung.`} onClose={pending ? () => undefined : onClose} open title="Rời household?"><form action={formAction} className="grid gap-4">{state.status === "error" && state.message ? <AuthFeedback message={state.message} /> : null}<div className="rounded-2xl bg-rose/18 p-4 text-sm font-semibold leading-6 text-ink">Tài khoản của bạn vẫn được giữ. Bạn có thể tạo hoặc tham gia household khác sau đó.</div><div className="grid grid-cols-[0.72fr_1.28fr] gap-3"><Button disabled={pending} onClick={onClose} type="button" variant="secondary">Hủy</Button><Button disabled={pending} type="submit" variant="danger">{pending ? "Đang rời..." : "Xác nhận rời"}</Button></div></form></Sheet>;
}

function DeleteHouseholdSheet({ householdName, onClose }: { householdName: string; onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteHouseholdAction, initialProfileActionState);
  useEffect(() => { if (state.status === "success") { router.replace("/onboarding"); router.refresh(); } }, [router, state.status]);
  return <Sheet closeLabel="Đóng xác nhận xóa household" description="Thao tác này xóa vĩnh viễn toàn bộ dữ liệu tài chính chung và không thể hoàn tác." onClose={pending ? () => undefined : onClose} open title="Xóa household?"><form action={formAction} className="grid gap-4">{state.status === "error" && state.message ? <AuthFeedback message={state.message} /> : null}<div className="rounded-2xl bg-rose/24 p-4 text-sm font-semibold leading-6 text-expense">Giao dịch, danh mục và ngân sách của tất cả thành viên sẽ bị xóa. Tài khoản đăng nhập không bị xóa.</div><Input autoComplete="off" disabled={pending} error={state.fieldErrors?.confirmation} label={`Nhập chính xác "${householdName}"`} name="confirmation" required /><div className="grid grid-cols-[0.72fr_1.28fr] gap-3"><Button disabled={pending} onClick={onClose} type="button" variant="secondary">Hủy</Button><Button disabled={pending} type="submit" variant="danger">{pending ? "Đang xóa..." : "Xóa vĩnh viễn"}</Button></div></form></Sheet>;
}
