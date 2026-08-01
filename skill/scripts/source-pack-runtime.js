#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const localTokenPattern = /\{local:([a-z0-9-]+)\}/g;
const localLanguageTagPattern = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export function loadSourceRegistry({ skillRoot = defaultSkillRoot } = {}) {
  const root = path.join(skillRoot, "assets", "source-packs");
  const registry = readJson(path.join(root, "index.json"));
  return {
    ...registry,
    packs: registry.packs.map((entry) => ({
      ...entry,
      pack: readJson(path.join(root, entry.path)),
    })),
  };
}

export function selectSourcePacks({ countryCode } = {}, { skillRoot = defaultSkillRoot } = {}) {
  const registry = loadSourceRegistry({ skillRoot });
  const normalized = String(countryCode || "").toUpperCase();
  const selected = ["global-base"];
  const regional = registry.packs.find((entry) => entry.id !== "global-base" && entry.countryCodes.includes(normalized));
  if (regional) selected.push(regional.id);
  return selected;
}

export function loadLocalLexicon(tag, { skillRoot = defaultSkillRoot } = {}) {
  if (!localLanguageTagPattern.test(tag)) return null;
  const lexiconPath = path.join(skillRoot, "assets", "source-packs", "local-language-lexicons", tag + ".json");
  return fs.existsSync(lexiconPath) ? readJson(lexiconPath) : null;
}

function renderQuery(template, context) {
  return template
    .replaceAll("{destination}", context.destination || "[目的地]")
    .replaceAll("{yearMonth}", context.yearMonth || "[旅行月份 年份]")
    .replaceAll("{tasteTerms}", (context.tasteTerms || []).join(" ") || "[本次偏好词]");
}

function localTokens(template) {
  return [...template.matchAll(localTokenPattern)].map((match) => match[1]);
}

function localTermsFor(tag, context, skillRoot) {
  const lexicon = loadLocalLexicon(tag, { skillRoot });
  const suppliedTerms = context.localLanguageTerms?.[tag];
  return {
    ...(lexicon?.terms || {}),
    ...(suppliedTerms && typeof suppliedTerms === "object" ? suppliedTerms : {}),
  };
}

function buildGlobalLocalQueries(intent, context, skillRoot, missingLocalTerms) {
  const tags = context.localLanguageTags || ["destination-local"];
  const tokens = localTokens(intent.queryTemplates.local);
  const queries = [];
  for (const languageTag of tags) {
    const terms = localTermsFor(languageTag, context, skillRoot);
    const missing = tokens.filter((token) => !terms[token]);
    if (missing.length) {
      missingLocalTerms.push({ languageTag, intentId: intent.id, tokens: missing });
      continue;
    }
    queries.push({
      languageTag,
      query: renderQuery(intent.queryTemplates.local, context)
        .replace(localTokenPattern, (_, token) => terms[token]),
    });
  }
  return queries;
}

export function buildQueryMatrix(context = {}, { skillRoot = defaultSkillRoot } = {}) {
  const registry = loadSourceRegistry({ skillRoot });
  const packIds = selectSourcePacks(context, { skillRoot });
  const activeId = packIds.at(-1);
  const active = registry.packs.find((entry) => entry.id === activeId).pack;
  const missingLocalTerms = [];
  return {
    packIds,
    languageStrategy: active.languageStrategy,
    intents: active.queryIntents.map((intent) => ({
      id: intent.id,
      sourceRoles: intent.sourceRoles,
      queries: {
        zh: renderQuery(intent.queryTemplates.zh, context),
        en: renderQuery(intent.queryTemplates.en, context),
        local: activeId === "global-base"
          ? buildGlobalLocalQueries(intent, context, skillRoot, missingLocalTerms)
          : [{
              languageTag: active.languageStrategy.localLanguageTags[0],
              query: renderQuery(intent.queryTemplates.local, context),
            }],
      },
    })),
    status: missingLocalTerms.length ? "needs-local-language-terms" : "ready",
    missingLocalTerms,
    searchFunnel: registry.searchFunnel,
  };
}
