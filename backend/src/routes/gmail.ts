import { Router } from "express";
import {
  completeGmailOAuth,
  createGmailConnectUrl,
  disconnectGmail,
  getGmailStatus
} from "../services/gmailService.js";
import { config } from "../config.js";
import { asyncHandler, fail, singleValue } from "../utils/http.js";

export const gmailRouter = Router();

gmailRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json(await getGmailStatus());
  })
);

gmailRouter.get(
  "/connect",
  asyncHandler(async (_req, res) => {
    res.redirect(createGmailConnectUrl());
  })
);

gmailRouter.get(
  "/oauth/callback",
  asyncHandler(async (req, res) => {
    const code = singleValue(req.query.code);
    const state = singleValue(req.query.state);
    if (!code || !state) {
      fail(400, "BAD_REQUEST", "Google OAuth callback neobsahuje potřebné údaje.");
    }

    await completeGmailOAuth(code, state);
    const redirectUrl = new URL("/settings", config.gmailFrontendUrl);
    redirectUrl.searchParams.set("gmail", "connected");
    res.redirect(redirectUrl.toString());
  })
);

gmailRouter.post(
  "/disconnect",
  asyncHandler(async (_req, res) => {
    await disconnectGmail();
    res.json(await getGmailStatus());
  })
);
