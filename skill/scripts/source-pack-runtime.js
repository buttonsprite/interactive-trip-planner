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
    .replaceAll("{destination}", context.destination)
    .replaceAll("{yearMonth}", context.yearMonth)
    .replaceAll("{tasteTerms}", context.tasteTerms.join(" "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRequiredContext(context) {
  const requiredFields = ["countryCode", "destination", "yearMonth"];
  const missingContextFields = requiredFields.filter((field) => (
    context[field] === undefined
    || context[field] === null
    || (typeof context[field] === "string" && !context[field].trim())
  ));
  if (missingContextFields.length) return { missingContextFields };
  for (const field of requiredFields) {
    if (typeof context[field] !== "string") throw new Error(field + " must be a non-empty string");
  }
  if (!/^[A-Za-z]{2}$/.test(context.countryCode.trim())) {
    throw new Error("countryCode must be a two-letter country code");
  }
  if (context.localLanguageTags !== undefined && !Array.isArray(context.localLanguageTags)) {
    throw new Error("localLanguageTags must be an array");
  }
  if (context.tasteTerms !== undefined && !Array.isArray(context.tasteTerms)) {
    throw new Error("tasteTerms must be an array");
  }
  return {
    missingContextFields: [],
    context: {
      ...context,
      countryCode: context.countryCode.trim().toUpperCase(),
      destination: context.destination.trim().replace(/\s+/g, " "),
      yearMonth: context.yearMonth.trim().replace(/\s+/g, " "),
      tasteTerms: (context.tasteTerms || [])
        .map((term) => String(term || "").trim().replace(/\s+/g, " "))
        .filter(Boolean),
    },
  };
}

function localTokens(template) {
  return [...template.matchAll(localTokenPattern)].map((match) => match[1]);
}

function lexiconAppliesToCountry(lexicon, countryCode) {
  return Array.isArray(lexicon?.countryCodes) && lexicon.countryCodes.includes(countryCode);
}

function requestedLocalLanguageTags(context, skillRoot) {
  const lexiconRoot = path.join(skillRoot, "assets", "source-packs", "local-language-lexicons");
  const countryCode = String(context.countryCode || "").toUpperCase();
  const defaults = fs.readdirSync(lexiconRoot)
    .filter((filename) => path.extname(filename) === ".json")
    .map((filename) => readJson(path.join(lexiconRoot, filename)))
    .filter((lexicon) => lexicon.defaultCountryCodes?.includes(countryCode))
    .map((lexicon) => lexicon.languageTag);
  const explicit = Array.isArray(context.localLanguageTags) ? context.localLanguageTags : [];
  const tags = [...new Set([...defaults, ...explicit])];
  return tags.length ? tags : ["destination-local"];
}

function localTermsFor(tag, context, skillRoot) {
  const lexicon = loadLocalLexicon(tag, { skillRoot });
  const suppliedTerms = context.localLanguageTerms?.[tag];
  return {
    ...(lexiconAppliesToCountry(lexicon, String(context.countryCode || "").toUpperCase()) ? lexicon.terms : {}),
    ...(suppliedTerms && typeof suppliedTerms === "object" ? suppliedTerms : {}),
  };
}

function buildGlobalLocalQueries(intent, context, skillRoot, missingLocalTerms) {
  const tags = requestedLocalLanguageTags(context, skillRoot);
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
  const normalized = normalizeRequiredContext(context);
  if (normalized.missingContextFields.length) {
    return {
      status: "needs-context",
      missingContextFields: normalized.missingContextFields,
      intents: [],
    };
  }
  context = normalized.context;
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
