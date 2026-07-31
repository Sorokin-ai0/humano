import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("the production build contains the finished Humano surface", async () => {
  const [
    layout,
    client,
    css,
    meetPage,
    insidePage,
    termsPage,
    privacyPage,
    previewPage,
  ] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/HumanoApp.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL("../app/meet-humano-1/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/inside-humano/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/research-preview/page.tsx", import.meta.url),
      "utf8",
    ),
    access(new URL("../.next/BUILD_ID", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../public/humano-hero.webp", import.meta.url)),
  ]);
  assert.match(layout, /Humano-1 — Natural conversation/);
  assert.match(client, /Say it how it is\./);
  assert.match(client, /What&#x27;s on your mind\?|What's on your mind\?/);
  assert.match(client, /\/debate/);
  assert.match(client, /slash-command-menu/);
  assert.match(client, /Humano model/);
  assert.match(client, /Humano-1/);
  assert.match(client, /Flagship/);
  assert.match(client, /H1/);
  assert.match(client, /Fast/);
  assert.match(client, /humano-hero\.webp/);
  assert.match(client, /unoptimized/);
  assert.match(client, /Start Humano/);
  assert.match(client, /Humano-1 introduction/);
  assert.match(client, /Conversation, rebuilt/);
  assert.match(client, /Most AI generates an answer/);
  assert.match(client, /Emotional awareness/);
  assert.match(client, /One behavior layer\. Two ways to talk\./);
  assert.match(client, /Meet HUMANO-1/);
  assert.match(client, /\/meet-humano-1/);
  assert.match(meetPage, /The intelligence wasn’t missing/);
  assert.match(meetPage, /Naturalness isn’t the presence/);
  assert.match(insidePage, /Seven decisions happen before/);
  assert.match(insidePage, /Humano response stages/);
  assert.match(client, /Before you talk to Humano/);
  assert.match(client, /at least 18 years old/);
  assert.match(client, /VPN, proxy, Tor/);
  assert.match(client, /Agree and enter Humano/);
  assert.match(client, /Humano is AI, not a person/);
  assert.match(client, /Your data · 1 of 2/);
  assert.match(client, /Delete all data/);
  assert.match(client, /return to the main menu afterward/);
  assert.match(client, /accept the research-preview/);
  assert.match(client, /Don&apos;t use it for/);
  assert.match(client, /binding individual arbitration/);
  assert.match(client, /class-action and jury-trial waivers/);
  assert.match(termsPage, /Use Humano at your own judgment and risk/);
  assert.match(termsPage, /Maximum limitation of liability/);
  assert.match(termsPage, /Binding individual arbitration/);
  assert.match(termsPage, /Humano Party, whether sole, joint, or concurrent/);
  assert.match(privacyPage, /What the preview remembers/);
  assert.match(privacyPage, /consent\s+receipt/);
  assert.match(previewPage, /Known risks/);
  assert.match(css, /\.landing-backdrop/);
  assert.match(css, /\.landing-start/);
  assert.match(css, /\.landing-meet-bar/);
  assert.match(css, /\.editorial-article/);
  assert.match(css, /\.landing-feature-grid/);
  assert.match(css, /\.slash-menu/);
  assert.match(css, /\.conversation-stage/);
  assert.match(css, /\.composer-disclosure/);
  assert.match(css, /\.consent-dialog/);
  assert.match(css, /\.data-dialog/);
  assert.match(css, /\.data-actions/);
  assert.match(css, /\.policy-section/);
  assert.match(css, /\.policy-legal-warning/);
  assert.match(css, /\.policy-arbitration-notice/);
  assert.doesNotMatch(
    `${client}\n${css}`,
    /Inspector|Conversation pulse|Live behavior trace|\.inspector|\.trace-/i,
  );
  assert.doesNotMatch(
    client,
    /Messages go to|Qwen|OpenRouter|local project|local system/i,
  );
  assert.doesNotMatch(
    `${layout}\n${client}\n${css}`,
    /codex-preview|react-loading-skeleton/i,
  );
});

test("keeps server credentials out of the client source", async () => {
  const [client, exampleEnv] = await Promise.all([
    readFile(
      new URL("../app/components/HumanoApp.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(client, /OPENROUTER_API_KEY|sk-or-/);
  assert.match(exampleEnv, /OPENROUTER_API_KEY=replace-/);
});

test("public routes keep internal behavior details private", async () => {
  const [chatRoute, healthRoute, consentRoute, worker] = await Promise.all([
    readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/consent/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(chatRoute, /Response\.json\(result/);
  assert.match(chatRoute, /response:\s*result\.response/);
  assert.match(chatRoute, /requireResearchPreviewAccess/);
  assert.match(consentRoute, /directConnectionConfirmed/);
  assert.match(consentRoute, /disputeTermsAccepted/);
  assert.match(consentRoute, /recordResearchConsent/);
  assert.doesNotMatch(healthRoute, /\.\.\.health|provider|modeModels|model/);
  assert.match(worker, /X-Content-Type-Options/);
  assert.match(worker, /Content-Security-Policy/);
  assert.match(worker, /!assets \|\| !images/);
  assert.match(worker, /Invalid image source/);
});
