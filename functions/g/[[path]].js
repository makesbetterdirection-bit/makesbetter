// /g/<id> — 초대 이벤트 공유 링크 (카카오 미리보기에 초대한 사람 이름)
import { share } from "../_lib/go.js";
export const onRequest = (ctx) => share(ctx.request, ctx.env);
