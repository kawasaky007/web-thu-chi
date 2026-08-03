export type AuthField =
  | "email"
  | "password"
  | "fullName"
  | "householdName"
  | "inviteCode";

export interface AuthActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
}

export const initialAuthActionState: AuthActionState = { status: "idle" };
