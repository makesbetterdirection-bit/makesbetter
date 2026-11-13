// /api/go/* — 초대 이벤트 API (functions/_lib/go.js)
import { api } from "../../_lib/go.js";
export const onRequest = (ctx) => api(ctx.request, ctx.env);
