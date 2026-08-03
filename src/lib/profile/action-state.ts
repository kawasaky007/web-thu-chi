export type ProfileActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"fullName" | "householdName" | "newOwnerId" | "confirmation", string>>;
};

export const initialProfileActionState: ProfileActionState = { status: "idle" };
