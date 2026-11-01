#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const MONTH = "Outubro 2026";
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const hasArg = (name) => args.includes(name);
const backupPath = getArg("--backup");
const targetEmail = getArg("--email");
const confirmEmail = getArg("--confirm-email");
const apply = hasArg("--apply");

function usage() {
  console.log(`Uso seguro (simulação por padrão):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
    node scripts/import-october-backup.mjs \\
    --backup ./backup.json --email usuario@exemplo.com

Para gravar, acrescente as duas confirmações:
  --apply --confirm-email usuario@exemplo.com

O script altera somente Outubro 2026 em finance_state. Nunca use a chave
service_role no navegador, no Vercel ou em arquivos versionados.`);
}

if (args.includes("--help") || !backupPath || !targetEmail) {
  usage();
  process.exit(args.includes("--help") ? 0 : 2);
}
if (apply && confirmEmail !== targetEmail) {
  console.error("Para aplicar, --confirm-email deve ser exatamente igual a --email.");
  process.exit(2);
}
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(2);
}

function unwrapBackup(value) {
  if (Array.isArray(value)) {
    const item = value.find((candidate) => candidate && typeof candidate === "object" && candidate.snapshot);
    return item?.snapshot || null;
  }
  if (value && typeof value === "object" && value.snapshot && typeof value.snapshot === "object") return value.snapshot;
  return value && typeof value === "object" ? value : null;
}

function getOctoberEntries(snapshot) {
  if (!snapshot) return [];
  const archived = snapshot.archivedData;
  if (archived && typeof archived === "object" && Array.isArray(archived[MONTH])) return archived[MONTH];
  if (snapshot.currentMonth === MONTH && Array.isArray(snapshot.entries)) return snapshot.entries;
  return [];
}

function validEntry(entry) {
  return entry && Number.isFinite(Number(entry.id)) && typeof entry.person === "string" &&
    typeof entry.origin === "string" && typeof entry.expense === "string" && Number.isFinite(Number(entry.value));
}

function monthSummary(entries, sourceSummary, existingSummary) {
  const salary = Number.isFinite(Number(sourceSummary?.salary))
    ? Number(sourceSummary.salary)
    : Number.isFinite(Number(existingSummary?.salary)) ? Number(existingSummary.salary) : 0;
  return {
    salary,
    expenses: entries.reduce((sum, entry) => sum + Number(entry.value), 0),
    card: entries.filter((entry) => entry.origin.trim().toUpperCase() === "CARTÃO").reduce((sum, entry) => sum + Number(entry.value), 0),
  };
}

const raw = JSON.parse(await fs.readFile(backupPath, "utf8"));
const backupSnapshot = unwrapBackup(raw);
const recoveredEntries = getOctoberEntries(backupSnapshot).filter(validEntry).map((entry) => ({
  id: Number(entry.id), person: entry.person, origin: entry.origin, expense: entry.expense, value: Number(entry.value),
}));
if (!recoveredEntries.length) {
  console.error(`Nenhum lançamento válido encontrado em ${MONTH} no backup.`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (usersError) throw usersError;
const user = users.users.find((candidate) => candidate.email?.toLowerCase() === targetEmail.toLowerCase());
if (!user) {
  console.error(`Não encontrei um usuário com o e-mail ${targetEmail}.`);
  process.exit(1);
}
const { data: row, error: readError } = await supabase.from("finance_state").select("id,user_id,payload,updated_at").eq("user_id", user.id).maybeSingle();
if (readError) throw readError;
if (!row?.payload) {
  console.error("A conta não possui finance_state atual; pare e verifique antes de importar.");
  process.exit(1);
}

const current = row.payload;
const currentArchived = current.archivedData && typeof current.archivedData === "object" ? current.archivedData : {};
const existingEntries = Array.isArray(currentArchived[MONTH]) ? currentArchived[MONTH] : [];
const byId = new Map(existingEntries.filter(validEntry).map((entry) => [Number(entry.id), entry]));
for (const entry of recoveredEntries) byId.set(entry.id, entry);
const mergedEntries = [...byId.values()];
const sourceSummary = backupSnapshot.summaries?.[MONTH];
const existingSummary = current.summaries?.[MONTH];
const summary = monthSummary(mergedEntries, sourceSummary, existingSummary);
const nextPayload = {
  ...current,
  archivedMonths: Array.from(new Set([...(Array.isArray(current.archivedMonths) ? current.archivedMonths : []), MONTH])),
  archivedData: { ...currentArchived, [MONTH]: mergedEntries },
  summaries: { ...(current.summaries || {}), [MONTH]: summary },
};
if (current.currentMonth === MONTH) nextPayload.entries = mergedEntries;

console.log(JSON.stringify({
  mode: apply ? "APPLY" : "DRY-RUN",
  target: { email: user.email, user_id: user.id },
  month: MONTH,
  backup_entries: recoveredEntries.length,
  existing_entries: existingEntries.length,
  final_entries: mergedEntries.length,
  summary,
  changed_fields: ["archivedMonths", "archivedData[Outubro 2026]", "summaries[Outubro 2026]", ...(current.currentMonth === MONTH ? ["entries"] : [])],
}, null, 2));

if (!apply) {
  console.log("\nNenhuma alteração foi gravada. Execute novamente com --apply --confirm-email para aplicar.");
  process.exit(0);
}

const { error: writeError } = await supabase.from("finance_state").upsert({
  id: row.id || user.id,
  user_id: user.id,
  payload: nextPayload,
  updated_at: new Date().toISOString(),
}, { onConflict: "user_id" });
if (writeError) throw writeError;
console.log(`\nImportação concluída: ${MONTH} foi gravado somente na conta ${user.email}.`);
