import { describe, expect, it } from "vitest";

import { urlBase64ToUint8Array } from "./push-client";

describe("urlBase64ToUint8Array", () => {
  it("giải mã chuỗi base64url cần thêm padding", () => {
    expect(Array.from(urlBase64ToUint8Array("QQ"))).toEqual([65]);
  });

  it("giải mã chuỗi base64url có ký tự thay thế -/_ và không cần padding", () => {
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});
