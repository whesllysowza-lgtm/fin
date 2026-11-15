import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import FinanceMascot from "@/components/FinanceMascot";
import { isPaidExpense, normalizePaidExpenses, paidExpenseKey, renamePaidExpense, togglePaidExpense as togglePaidExpenseState } from "@/lib/monthlyPaidExpenses";
import { BarChart3, ChevronDown, CirclePlus, ClipboardList, History, Home as HomeIcon, Plus, Search, Settings2, Download, X, Pencil, Trash2, Undo2, LogOut, Eye, EyeOff, Bold, RefreshCw } from "lucide-react";

type Entry = { id: number; person: string; origin: string; expense: string; value: number; purchaseDate?: string };
type InvoiceEntry = Entry & { sourceMonth: string };
type HistoryRowEntry = Entry & { sourceMonth?: string };
type ExpenseForm = { person: string; origin: string; expense: string; value: string; purchaseDate: string };
type PendingSyncConflict = { localPayload: Record<string, unknown>; remotePayload: Record<string, unknown> | null; remoteUpdatedAt: string | null };
type MonthlySummary = { salary: number; expenses: number; card: number };
type IndicatorKey = "salary" | "expenses" | "leftover" | "card";
type IndicatorSettings = Record<IndicatorKey, boolean>;
type ThemePalette = { primary: string; background: string; card: string; text: string };
type AppIcon = "finance-wallet" | "finance-chart" | "finance-coin" | "finance-piggy";
const appIconOptions: { id: AppIcon; label: string }[] = [{ id: "finance-wallet", label: "Carteira" }, { id: "finance-chart", label: "Gráfico" }, { id: "finance-coin", label: "Moeda" }, { id: "finance-piggy", label: "Cofrinho" }];
const emptyMonthlySummary = (): MonthlySummary => ({ salary: 0, expenses: 0, card: 0 });

const defaultPalette: ThemePalette = { primary: "#38a9e8", background: "#f0f9ff", card: "#d9f1ff", text: "#12344d" };
const dangerPalette: ThemePalette = { primary: "#b42318", background: "#fff5f4", card: "#fbe3e0", text: "#4a1713" };
const legacyGreenPalette = new Set(["#2e6f25", "#397d2f", "#5da653", "#3d7732"]);
function smartPalette(primary: string): ThemePalette {
  const { h, s } = hexToHsl(primary);
  const intensity = Math.max(0.28, Math.min(0.78, s || 0.45));
  return {
    primary: primary.toLowerCase(),
    background: hslToHex(h, Math.min(0.22, intensity * 0.34), 0.97),
    card: hslToHex(h, Math.min(0.34, intensity * 0.58), 0.93),
    text: hslToHex(h, Math.min(0.42, intensity * 0.7), 0.18),
  };
}
type AppSnapshot = { boldText: boolean; appIcon: AppIcon; people: string[]; origins: string[]; expenses: string[]; hiddenExpensesByMonth: Record<string, string[]>; paidExpenses: Record<string, boolean>; entries: Entry[]; archivedMonths: string[]; archivedData: Record<string, Entry[]>; summaries: Record<string, MonthlySummary>; indicatorSettings: Record<string, IndicatorSettings>; palette: ThemePalette; currentMonth: string; alertEmail: string; selectedPerson: string; reminderEnabled: boolean; billingCycleMigrationVersion?: number;
 reminderTime: string; reminderDay: number };

const localBackupKey = (userId: string) => `finance-json-backups:${userId}`;
const localBackupResolvedKey = (userId: string) => `finance-json-backup-resolved:${userId}`;
const localDraftSavedAtKey = (userId: string) => `finance-state-draft-saved-at:${userId}`;
function saveLocalJsonBackup(userId: string, snapshot: AppSnapshot) {
  if (!isSnapshotComplete(snapshot as unknown as Record<string, unknown>)) return;
  try {
    const key = localBackupKey(userId);
    let previous: Array<{ savedAt: string; snapshot: AppSnapshot }> = [];
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(stored)) previous = stored;
    } catch {
      previous = [];
    }
    const next = [{ savedAt: new Date().toISOString(), snapshot }, ...previous].slice(0, 12);
    localStorage.setItem(key, JSON.stringify(next));
  } catch (error) {
    console.warn("[Backup local] Não foi possível salvar o JSON:", error);
  }
}

async function saveMonthlySnapshotRow(row: Record<string, unknown>): Promise<{ written: boolean; error: Error | null }> {
  const userId = String(row.user_id);
  const month = String(row.month);
  const sourceUpdatedAt = String(row.source_updated_at);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: current, error: readError } = await supabase.from("finance_month_snapshots")
      .select("payload, source_updated_at")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle();
    if (readError) return { written: false, error: new Error(readError.message) };

    if (!current) {
      const { error: insertError } = await supabase.from("finance_month_snapshots").insert(row);
      if (!insertError) return { written: true, error: null };
      if (insertError.code === "23505") continue;
      return { written: false, error: new Error(insertError.message) };
    }

    const currentVersion = typeof current.source_updated_at === "string" ? current.source_updated_at : null;
    const versionOrder = currentVersion ? compareTimestamps(currentVersion, sourceUpdatedAt) : -1;
    if (versionOrder !== null && versionOrder > 0) return { written: false, error: null };
    if (versionOrder === 0 && sameSnapshot(current.payload, row.payload)) return { written: false, error: null };

    let updateQuery = supabase.from("finance_month_snapshots")
      .update({ payload: row.payload, source_updated_at: sourceUpdatedAt })
      .eq("user_id", userId)
      .eq("month", month);
    updateQuery = currentVersion ? updateQuery.eq("source_updated_at", currentVersion) : updateQuery.is("source_updated_at", null);
    const { data: updated, error: updateError } = await updateQuery.select("source_updated_at").maybeSingle();
    if (updateError) return { written: false, error: new Error(updateError.message) };
    if (updated) return { written: true, error: null };
  }
  return { written: false, error: new Error(`O snapshot de ${month} mudou repetidamente; tente sincronizar novamente.`) };
}

async function saveMonthlySnapshots(userId: string, snapshot: AppSnapshot, sourceUpdatedAt: string) {
  const months = Array.from(new Set([
    snapshot.currentMonth,
    ...Object.keys(snapshot.summaries),
    ...Object.keys(snapshot.archivedData),
  ].filter(Boolean)));
  const rows = months.map((month) => ({
    user_id: userId,
    month,
    payload: {
      version: 1,
      month,
      entries: snapshot.currentMonth === month ? snapshot.entries : (snapshot.archivedData[month] || []),
      summary: snapshot.summaries[month] || emptyMonthlySummary(),
      people: snapshot.people,
      origins: snapshot.origins,
      expenses: snapshot.expenses,
      hiddenExpensesByMonth: { [month]: snapshot.hiddenExpensesByMonth[month] || [] },
      paidExpenses: Object.fromEntries(Object.entries(snapshot.paidExpenses).filter(([key]) => key.startsWith(`${month}::`))),
      indicatorSettings: snapshot.indicatorSettings,
      palette: snapshot.palette,
      selectedPerson: snapshot.selectedPerson,
      currentMonth: snapshot.currentMonth,
      boldText: snapshot.boldText,
      appIcon: snapshot.appIcon,
    },
    updated_at: new Date().toISOString(),
    source_updated_at: sourceUpdatedAt,
  }));
  if (!rows.length) return null;
  const results = await Promise.all(rows.map((row) => saveMonthlySnapshotRow(row)));
  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) return failedResult.error;
  const historyRows = rows.filter((_, index) => results[index].written).map(({ updated_at: _updatedAt, ...row }) => row);
  if (!historyRows.length) return null;
  const { error: historyError } = await supabase.from("finance_month_snapshot_history").insert(historyRows);
  return historyError ? new Error(historyError.message) : null;
}

const initialEntries: Entry[] = [
  { id: 1, person: "Vanessa", origin: "CARTÃO", expense: "FATURA", value: 10.9 },
  { id: 2, person: "Pai", origin: "CARTÃO", expense: "FATURA", value: 40 },
  { id: 3, person: "Mãe", origin: "CARTÃO", expense: "FATURA", value: 20 },
  { id: 4, person: "Wesly", origin: "CARTÃO", expense: "FATURA", value: 47.49 },
  { id: 5, person: "Wesly", origin: "DESPESAS SIMPLES", expense: "ACADEMIA", value: 85 },
  { id: 6, person: "Wesly", origin: "CARTÃO", expense: "FATURA", value: 48.76 },
  { id: 7, person: "Wesly", origin: "CARTÃO", expense: "FATURA", value: 105.7 },
  { id: 8, person: "Cristiano", origin: "CARTÃO", expense: "FATURA", value: 16.71 },
  { id: 9, person: "Wesly", origin: "CARTÃO", expense: "FATURA", value: 10 },
  { id: 10, person: "Wesly", origin: "CARTÃO", expense: "FATURA", value: 17.7 },
  { id: 11, person: "Wesly", origin: "DESPESAS SIMPLES", expense: "INTERNET", value: 80 },
  { id: 12, person: "Wesly", origin: "DESPESAS SIMPLES", expense: "CASA", value: 588 },
];

const defaultPeople: string[] = [];
const defaultOrigins: string[] = [];
const defaultExpenses: string[] = [];
const defaultIndicatorSettings: Record<string, IndicatorSettings> = {
  Wesly: { salary: true, expenses: true, leftover: true, card: true },
  Pai: { salary: false, expenses: true, leftover: false, card: true },
  Mãe: { salary: false, expenses: true, leftover: false, card: true },
  Vanessa: { salary: false, expenses: true, leftover: false, card: true },
  Cristiano: { salary: false, expenses: true, leftover: false, card: true },
  Vô: { salary: false, expenses: true, leftover: false, card: true },
};
function readIndicatorSettings(): Record<string, IndicatorSettings> {
  try {
    const stored = JSON.parse(localStorage.getItem("wesly-indicator-settings") || "null");
    return stored && typeof stored === "object" ? { ...defaultIndicatorSettings, ...stored } : defaultIndicatorSettings;
  } catch {
    return defaultIndicatorSettings;
  }
}
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const legacyStorageKeys = ["wesly-people", "wesly-origins", "wesly-expenses", "wesly-current-month", "wesly-archived-months", "wesly-archived-data", "wesly-current-entries", "wesly-monthly-summaries", "wesly-indicator-settings"];

function parseAmount(input: string) {
  const value = input.trim().replace(/[R$\s]/g, "").replace(/;/g, ",");
  const normalized = value.includes(",") && value.includes(".") ? value.replace(/\./g, "").replace(",", ".") : value.replace(",", ".");
  return Number(normalized);
}
function normalizedLabel(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR");
}
function isCardOrigin(value: string) {
  return ["CARTAO", "CARTAO DE CREDITO"].includes(normalizedLabel(value));
}
function isInvoiceExpense(value: string) {
  return ["FATURA", "FUTURA"].includes(normalizedLabel(value));
}
const WESLY_CARD_CLOSING_DAY = 6;
const WESLY_FATURA_MIGRATION_VERSION = 2;
const WESLY_FATURA_MIGRATION_FROM = "Novembro 2026";
const WESLY_FATURA_MIGRATION_TO = "Dezembro 2026";
function isWeslyFaturaEntry(person: string, origin: string, expense: string) {
  return normalizedLabel(person) === "WESLY" && isCardOrigin(origin) && isInvoiceExpense(expense);
}
function entryFingerprint(entry: Entry) {
  return JSON.stringify([entry.id, normalizedLabel(entry.person), normalizedLabel(entry.origin), normalizedLabel(entry.expense), entry.value, entry.purchaseDate || ""]);
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
}
function sameSnapshot(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}
function emptyRegistrationForm(): ExpenseForm {
  return { person: "", origin: "", expense: "", value: "", purchaseDate: localDateInputValue() };
}
function localDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function invoiceMonthForCardDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const purchaseDate = new Date(Date.UTC(year, month - 1, day));
  if (purchaseDate.getUTCFullYear() !== year || purchaseDate.getUTCMonth() !== month - 1 || purchaseDate.getUTCDate() !== day) return null;
  const invoiceDate = new Date(Date.UTC(year, month - 1 + (day > WESLY_CARD_CLOSING_DAY ? 1 : 0), 1));
  return `${monthNames[invoiceDate.getUTCMonth()]} ${invoiceDate.getUTCFullYear()}`;
}
function formatPurchaseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
function getWeslyCurrentInvoiceMonth() {
  return invoiceMonthForCardDate(localDateInputValue()) || calendarMonth();
}
function collectCurrentInvoiceEntries(entries: Entry[], archivedData: Record<string, Entry[]>, currentMonth: string, currentCalendarMonth: string, weslyInvoiceMonth: string): InvoiceEntry[] {
  const calendarRows = currentCalendarMonth === currentMonth ? entries : (archivedData[currentCalendarMonth] || []);
  const invoiceRows = weslyInvoiceMonth === currentMonth ? entries : (archivedData[weslyInvoiceMonth] || []);
  const uniqueRows = new Map<string, InvoiceEntry>();
  for (const entry of calendarRows) {
    const fingerprint = entryFingerprint(entry);
    if (!uniqueRows.has(fingerprint)) uniqueRows.set(fingerprint, { ...entry, sourceMonth: currentCalendarMonth });
  }
  for (const entry of invoiceRows) {
    const fingerprint = entryFingerprint(entry);
    if (!uniqueRows.has(fingerprint)) uniqueRows.set(fingerprint, { ...entry, sourceMonth: weslyInvoiceMonth });
  }
  return Array.from(uniqueRows.values()).filter((entry) => {
    if (!isCardOrigin(entry.origin) || !isInvoiceExpense(entry.expense)) return false;
    if (normalizedLabel(entry.person) !== "WESLY") return entry.sourceMonth === currentCalendarMonth;
    const dateBasedMonth = entry.purchaseDate ? invoiceMonthForCardDate(entry.purchaseDate) : null;
    return dateBasedMonth ? dateBasedMonth === weslyInvoiceMonth : entry.sourceMonth === weslyInvoiceMonth;
  });
}
function migrateLegacyWeslyFaturaEntries(payload: Record<string, unknown>) {
  if (Number(payload.billingCycleMigrationVersion) >= WESLY_FATURA_MIGRATION_VERSION) return { payload, changed: false, moved: 0 };
  const fromMonth = WESLY_FATURA_MIGRATION_FROM;
  const toMonth = WESLY_FATURA_MIGRATION_TO;
  const previousVersion = Number(payload.billingCycleMigrationVersion) || 0;
  const oldCurrentMonth = typeof payload.currentMonth === "string" ? payload.currentMonth : calendarMonth();
  const entries = Array.isArray(payload.entries) ? [...payload.entries as Entry[]] : [];
  const archivedSource = payload.archivedData;
  const archivedData: Record<string, Entry[]> = archivedSource && typeof archivedSource === "object" && !Array.isArray(archivedSource)
    ? Object.fromEntries(Object.entries(archivedSource as Record<string, unknown>).filter(([, rows]) => Array.isArray(rows)) as Array<[string, Entry[]]>)
    : {};
  const rowsForMonth = (month: string) => month === oldCurrentMonth ? entries : (archivedData[month] || []);
  const rowsByMonth = new Map<string, Entry[]>([[fromMonth, [...rowsForMonth(fromMonth)]], [toMonth, [...rowsForMonth(toMonth)]]]);
  const affectedMonths = new Set<string>([fromMonth, toMonth]);
  let moved = 0;
  for (const sourceMonth of [fromMonth, toMonth]) {
    const sourceRows = rowsByMonth.get(sourceMonth) || [];
    for (const entry of [...sourceRows]) {
      if (!isWeslyFaturaEntry(entry.person, entry.origin, entry.expense)) continue;
      const dateBasedMonth = entry.purchaseDate ? invoiceMonthForCardDate(entry.purchaseDate) : null;
      // Version 1 moved undated November rows to December. Keep that legacy behavior
      // for never-migrated snapshots, but do not guess the purchase date in v2.
      const destinationMonth = dateBasedMonth || (previousVersion < 1 && sourceMonth === fromMonth ? toMonth : sourceMonth);
      if (destinationMonth === sourceMonth) continue;
      const fingerprint = entryFingerprint(entry);
      const currentSourceRows = rowsByMonth.get(sourceMonth) || [];
      rowsByMonth.set(sourceMonth, currentSourceRows.filter((candidate) => entryFingerprint(candidate) !== fingerprint));
      const destinationRows = rowsByMonth.get(destinationMonth) || [...rowsForMonth(destinationMonth)];
      if (!destinationRows.some((candidate) => entryFingerprint(candidate) === fingerprint)) {
        rowsByMonth.set(destinationMonth, [...destinationRows, entry]);
        moved += 1;
      }
      affectedMonths.add(sourceMonth);
      affectedMonths.add(destinationMonth);
    }
  }
  let currentMonth = oldCurrentMonth;
  if (oldCurrentMonth === toMonth && calendarMonth() === fromMonth) {
    currentMonth = fromMonth;
  }
  const summaries = payload.summaries && typeof payload.summaries === "object" && !Array.isArray(payload.summaries)
    ? { ...(payload.summaries as Record<string, MonthlySummary>) }
    : {};
  const updateSummary = (month: string, rows: Entry[]) => {
    const previous = summaries[month] || emptyMonthlySummary();
    summaries[month] = { ...previous, expenses: rows.reduce((sum, entry) => sum + entry.value, 0), card: rows.filter((entry) => isCardOrigin(entry.origin)).reduce((sum, entry) => sum + entry.value, 0) };
  };
  const archivedMonthSet = new Set(Array.isArray(payload.archivedMonths) ? payload.archivedMonths as string[] : []);
  for (const month of Array.from(affectedMonths)) {
    const monthRows = rowsByMonth.get(month) || [...rowsForMonth(month)];
    updateSummary(month, monthRows);
    if (month === currentMonth) delete archivedData[month];
    else {
      archivedData[month] = monthRows;
      archivedMonthSet.add(month);
    }
  }
  const archivedMonths = Array.from(archivedMonthSet).filter((month) => month !== currentMonth);
  const nextEntries = affectedMonths.has(currentMonth) ? (rowsByMonth.get(currentMonth) || []) : entries;
  return {
    payload: { ...payload, currentMonth, entries: nextEntries, archivedData, archivedMonths, summaries, billingCycleMigrationVersion: WESLY_FATURA_MIGRATION_VERSION },
    changed: true,
    moved,
  };
}
function isSimpleOrigin(value: string) {
  return ["CONTA SIMPLES", "DESPESAS SIMPLES"].includes(normalizedLabel(value));
}
function hexToHsl(hex: string) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: Math.round((h + 360) % 360), s, l };
}
function hslToHex(h: number, s: number, l: number) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - chroma / 2;
  const [r, g, b] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function readLegacyState(): Record<string, unknown> | null {
  const readText = (key: string) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const readJson = (key: string) => {
    try { return JSON.parse(readText(key) || "null"); } catch { return null; }
  };
  const value = {
    people: readJson("wesly-people"),
    origins: readJson("wesly-origins"),
    expenses: readJson("wesly-expenses"),
    currentMonth: readText("wesly-current-month"),
    archivedMonths: readJson("wesly-archived-months"),
    archivedData: readJson("wesly-archived-data"),
    entries: readJson("wesly-current-entries"),
    summaries: readJson("wesly-monthly-summaries"),
    indicatorSettings: readJson("wesly-indicator-settings"),
  };
  return Object.values(value).some((item) => item !== null) ? value : null;
}

function applyCloudState(payload: Record<string, unknown> | null, setters: {
  setPeople: (value: string[]) => void;
  setOrigins: (value: string[]) => void;
  setExpenses: (value: string[]) => void;
  setHiddenExpensesByMonth: (value: Record<string, string[]>) => void;
  setPaidExpenses: (value: Record<string, boolean>) => void;
  setEntries: (value: Entry[]) => void;
  setArchivedMonths: (value: string[]) => void;
  setArchivedData: (value: Record<string, Entry[]>) => void;
  setSummaries: (value: Record<string, MonthlySummary>) => void;
  setIndicatorSettings: (value: Record<string, IndicatorSettings>) => void;
  setPalette: (value: ThemePalette) => void;
  setCurrentMonth: (value: string) => void;
  setAlertEmail: (value: string) => void;
  setSelectedPerson: (value: string) => void;
  setReminderEnabled: (value: boolean) => void;
  setReminderTime: (value: string) => void;
  setReminderDay: (value: number) => void;
  setBoldText: (value: boolean) => void;
  setAppIcon: (value: AppIcon) => void;
}) {
  if (!payload) return;
  if (Array.isArray(payload.people)) setters.setPeople(payload.people as string[]);
  if (Array.isArray(payload.origins)) setters.setOrigins(payload.origins as string[]);
  if (Array.isArray(payload.expenses)) setters.setExpenses(payload.expenses as string[]);
  if (payload.hiddenExpensesByMonth && typeof payload.hiddenExpensesByMonth === "object" && !Array.isArray(payload.hiddenExpensesByMonth)) setters.setHiddenExpensesByMonth(payload.hiddenExpensesByMonth as Record<string, string[]>);
  if (payload.paidExpenses && typeof payload.paidExpenses === "object") setters.setPaidExpenses(normalizePaidExpenses(payload.paidExpenses, typeof payload.currentMonth === "string" ? payload.currentMonth : calendarMonth()));
  if (Array.isArray(payload.entries)) setters.setEntries(payload.entries as Entry[]);
  if (Array.isArray(payload.archivedMonths)) setters.setArchivedMonths(payload.archivedMonths as string[]);
  if (payload.archivedData && typeof payload.archivedData === "object") setters.setArchivedData(payload.archivedData as Record<string, Entry[]>);
  if (payload.summaries && typeof payload.summaries === "object") setters.setSummaries(payload.summaries as Record<string, MonthlySummary>);
  if (payload.indicatorSettings && typeof payload.indicatorSettings === "object") setters.setIndicatorSettings(payload.indicatorSettings as Record<string, IndicatorSettings>);
  if (payload.palette && typeof payload.palette === "object") {
    const primary = ((payload.palette as Partial<ThemePalette>).primary || defaultPalette.primary).toLowerCase();
    setters.setPalette(legacyGreenPalette.has(primary) ? defaultPalette : smartPalette(primary));
  }
  if (typeof payload.currentMonth === "string") setters.setCurrentMonth(payload.currentMonth);
  if (typeof payload.alertEmail === "string") setters.setAlertEmail(payload.alertEmail);
  if (typeof payload.selectedPerson === "string") setters.setSelectedPerson(payload.selectedPerson);
  if (typeof payload.reminderEnabled === "boolean") setters.setReminderEnabled(payload.reminderEnabled);
  if (typeof payload.reminderTime === "string") setters.setReminderTime(payload.reminderTime);
  if (typeof payload.reminderDay === "number" && payload.reminderDay >= 1 && payload.reminderDay <= 31) setters.setReminderDay(payload.reminderDay);
  if (typeof payload.boldText === "boolean") setters.setBoldText(payload.boldText);
  if (typeof payload.appIcon === "string" && appIconOptions.some((option) => option.id === payload.appIcon)) setters.setAppIcon(payload.appIcon as AppIcon);
}

async function compareAndSaveFinanceState(userId: string, payload: AppSnapshot, expectedUpdatedAt: string | null) {
  const previousTimestamp = expectedUpdatedAt ? Date.parse(expectedUpdatedAt) : 0;
  const updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previousTimestamp) ? previousTimestamp + 1 : 0)).toISOString();
  if (expectedUpdatedAt) {
    const { data, error } = await supabase.from("finance_state")
      .update({ payload, updated_at: updatedAt })
      .eq("user_id", userId)
      .eq("updated_at", expectedUpdatedAt)
      .select("updated_at")
      .maybeSingle();
    return { updatedAt: data?.updated_at || updatedAt, error, conflict: !error && !data };
  }

  const { data, error } = await supabase.from("finance_state")
    .insert({ id: userId, user_id: userId, payload, updated_at: updatedAt })
    .select("updated_at")
    .maybeSingle();
  if (error?.code === "23505") return { updatedAt, error: null, conflict: true };
  return { updatedAt: data?.updated_at || updatedAt, error, conflict: !error && !data };
}

function compareTimestamps(left: string, right: string) {
  const leftMs = Date.parse(left), rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return null;
  if (leftMs !== rightMs) return leftMs < rightMs ? -1 : 1;
  const subMillisecond = (value: string) => {
    const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:?\d{2}$)/i)?.[1] || "";
    return Number(fraction.padEnd(6, "0").slice(3, 6) || 0);
  };
  const leftRemainder = subMillisecond(left), rightRemainder = subMillisecond(right);
  return leftRemainder === rightRemainder ? 0 : leftRemainder < rightRemainder ? -1 : 1;
}

function calendarMonth() { const now = new Date(); return `${monthNames[now.getMonth()]} ${now.getFullYear()}`; }
function reminderTarget(now: Date, selectedDay: number) {
  let year = now.getFullYear();
  let monthIndex = now.getMonth();
  let lastDay = new Date(year, monthIndex + 1, 0).getDate();
  let day = Math.min(selectedDay, lastDay);
  if (now.getDate() > day) {
    monthIndex += 1;
    if (monthIndex > 11) { monthIndex = 0; year += 1; }
    lastDay = new Date(year, monthIndex + 1, 0).getDate();
    day = Math.min(selectedDay, lastDay);
  }
  return { day, month: `${monthNames[monthIndex]} ${year}` };
}
function monthEndReminderKey(userId: string, month: string) { return `finance-month-end-reminder:${userId}:${month}`; }
async function showMonthEndReminder(userId: string, month: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const key = monthEndReminderKey(userId, month);
  if (localStorage.getItem(key) === "sent") return;
  const title = "Lembrete de pagamento";
  const options: NotificationOptions = { body: `Confira e marque as contas pagas de ${month}.`, icon: "/icons/finance-wallet-192.png", badge: "/icons/finance-wallet-192.png", tag: `finance-month-end-${month}` };
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
    localStorage.setItem(key, "sent");
  } catch (error) {
    console.warn("[Notificação] Não foi possível mostrar o lembrete:", error);
  }
}
function hasAnyDetailedEntries(payload: Record<string, unknown> | null) {
  if (!payload) return false;
  if (Array.isArray(payload.entries) && payload.entries.length > 0) return true;
  const archivedData = payload.archivedData;
  return Boolean(archivedData && typeof archivedData === "object" && !Array.isArray(archivedData) && Object.values(archivedData as Record<string, unknown>).some((value) => Array.isArray(value) && value.length > 0));
}
function hasRecoverableSnapshotData(payload: Record<string, unknown> | null) {
  if (!payload) return false;
  if (hasAnyDetailedEntries(payload)) return true;
  if (["people", "origins", "expenses", "archivedMonths"].some((key) => Array.isArray(payload[key]) && (payload[key] as unknown[]).length > 0)) return true;
  const summaries = isSnapshotRecord(payload.summaries) ? Object.values(payload.summaries) : [];
  if (summaries.some((summary) => isSnapshotRecord(summary) && [summary.salary, summary.expenses, summary.card].some((value) => typeof value === "number" && Number.isFinite(value) && value !== 0))) return true;
  if (["hiddenExpensesByMonth", "paidExpenses"].some((key) => isSnapshotRecord(payload[key]) && Object.keys(payload[key] as Record<string, unknown>).length > 0)) return true;
  const customSettings = isSnapshotRecord(payload.indicatorSettings) && !sameSnapshot(payload.indicatorSettings, defaultIndicatorSettings);
  const customPalette = isSnapshotRecord(payload.palette) && !sameSnapshot(payload.palette, defaultPalette);
  return Boolean(customSettings || customPalette || payload.alertEmail || payload.reminderEnabled || payload.boldText || (payload.appIcon && payload.appIcon !== "finance-wallet") || payload.selectedPerson);
}
function hasUnreflectedLocalEntries(localPayload: Record<string, unknown>, remotePayload: Record<string, unknown>) {
  const fingerprints = (payload: Record<string, unknown>) => {
    const current = Array.isArray(payload.entries) ? payload.entries as Entry[] : [];
    const archived = payload.archivedData && typeof payload.archivedData === "object" && !Array.isArray(payload.archivedData)
      ? Object.values(payload.archivedData as Record<string, unknown>).flatMap((rows) => Array.isArray(rows) ? rows as Entry[] : [])
      : [];
    return new Set([...current, ...archived].filter((entry) => entry && typeof entry === "object" && typeof entry.id === "number" && typeof entry.person === "string" && typeof entry.origin === "string" && typeof entry.expense === "string" && typeof entry.value === "number").map(entryFingerprint));
  };
  const remoteFingerprints = fingerprints(remotePayload);
  return Array.from(fingerprints(localPayload)).some((fingerprint) => !remoteFingerprints.has(fingerprint));
}
function isSnapshotRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function isSnapshotComplete(value: Record<string, unknown>) {
  return ["people", "origins", "expenses", "entries", "archivedMonths"].every((key) => Array.isArray(value[key]))
    && ["archivedData", "summaries", "hiddenExpensesByMonth", "paidExpenses", "indicatorSettings", "palette"].every((key) => isSnapshotRecord(value[key]))
    && ["appIcon", "currentMonth", "alertEmail", "selectedPerson", "reminderTime"].every((key) => typeof value[key] === "string")
    && typeof value.boldText === "boolean" && typeof value.reminderEnabled === "boolean" && Number.isFinite(value.reminderDay);
}
function mergeSnapshotWithFallback(fallback: Record<string, unknown>, recent: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...fallback, ...recent };
  for (const key of ["people", "origins", "expenses", "entries", "archivedMonths"]) {
    const previous = fallback[key], current = recent[key];
    if (Array.isArray(previous) && previous.length > 0 && Array.isArray(current) && current.length === 0) merged[key] = previous;
  }
  for (const key of ["archivedData", "summaries", "hiddenExpensesByMonth", "paidExpenses", "indicatorSettings", "palette"]) {
    const previous = fallback[key], current = recent[key];
    if (!isSnapshotRecord(previous) || !isSnapshotRecord(current)) continue;
    const combined: Record<string, unknown> = { ...previous, ...current };
    for (const [nestedKey, nestedValue] of Object.entries(current)) {
      const previousNested = previous[nestedKey];
      if (isSnapshotRecord(previousNested) && isSnapshotRecord(nestedValue)) combined[nestedKey] = { ...previousNested, ...nestedValue };
      else if (Array.isArray(previousNested) && previousNested.length > 0 && Array.isArray(nestedValue) && nestedValue.length === 0) combined[nestedKey] = previousNested;
    }
    merged[key] = combined;
  }
  return merged;
}
function readNewestLocalJsonBackup(userId: string): { snapshot: Record<string, unknown>; savedAt: number } | null {
  try {
    const backups = JSON.parse(localStorage.getItem(localBackupKey(userId)) || "[]") as Array<{ savedAt?: string; snapshot?: unknown }>;
    if (!Array.isArray(backups)) return null;
    const candidates = backups
      .filter((item) => isSnapshotRecord(item?.snapshot))
      .map((item) => ({ snapshot: item.snapshot as Record<string, unknown>, savedAt: Date.parse(item.savedAt || "") }))
      .filter((item) => Number.isFinite(item.savedAt))
      .sort((left, right) => right.savedAt - left.savedAt);
    const newest = candidates[0];
    if (!newest || isSnapshotComplete(newest.snapshot)) return newest || null;
    const newestComplete = candidates.find((item) => isSnapshotComplete(item.snapshot));
    if (!newestComplete) return newest;
    const snapshot = mergeSnapshotWithFallback(newestComplete.snapshot, newest.snapshot);
    return { snapshot, savedAt: newest.savedAt };
  } catch {
    return null;
  }
}
function nextMonth(label: string) {
  const [month, yearText] = label.split(" ");
  const index = Math.max(0, monthNames.indexOf(month));
  const year = Number(yearText) || new Date().getFullYear();
  return `${monthNames[(index + 1) % 12]} ${index === 11 ? year + 1 : year}`;
}

export default function Home() {
  const [tab, setTab] = useState("PAINEL");
  const [boldText, setBoldText] = useState(false);
  const [appIcon, setAppIcon] = useState<AppIcon>("finance-wallet");
  const [people, setPeople] = useState<string[]>(defaultPeople);
  const [origins, setOrigins] = useState<string[]>(defaultOrigins);
  const [expenses, setExpenses] = useState<string[]>(defaultExpenses);
  const [hiddenExpensesByMonth, setHiddenExpensesByMonth] = useState<Record<string, string[]>>({});
  const [paidExpenses, setPaidExpenses] = useState<Record<string, boolean>>({});
  const [selectedPerson, setSelectedPerson] = useState("");
  const [currentMonth, setCurrentMonth] = useState(calendarMonth);
  const [archivedMonths, setArchivedMonths] = useState<string[]>([]);
  const [archivedData, setArchivedData] = useState<Record<string, Entry[]>>({});
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summaries, setSummaries] = useState<Record<string, MonthlySummary>>({});
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ExpenseForm>(emptyRegistrationForm);
  const [message, setMessage] = useState("");
  const [showNewMonthConfirm, setShowNewMonthConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showSalaryEditor, setShowSalaryEditor] = useState(false);
  const [salaryDraft, setSalaryDraft] = useState("");
  const [showSalary, setShowSalary] = useState(false);
  const [indicatorSettings, setIndicatorSettings] = useState<Record<string, IndicatorSettings>>({});
  const [palette, setPalette] = useState<ThemePalette>(defaultPalette);
  const [alertEmail, setAlertEmail] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [reminderDay, setReminderDay] = useState(28);
  const [accountLabel, setAccountLabel] = useState("usuário");
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudLoadError, setCloudLoadError] = useState("");
  const [legacyRecoveryPayload, setLegacyRecoveryPayload] = useState<Record<string, unknown> | null>(null);
  const [legacyRecoveryError, setLegacyRecoveryError] = useState("");
  const [syncConflict, setSyncConflict] = useState<PendingSyncConflict | null>(null);
  const [showMascot, setShowMascot] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSnapshotRef = useRef<AppSnapshot | null>(null);
  const undoSnapshotRef = useRef<AppSnapshot | null>(null);
  const skipHistoryRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const userIdRef = useRef<string | null>(null);
  const skipNextPersistRef = useRef(false);
  const hydratingRef = useRef(false);
  const latestSnapshotRef = useRef<AppSnapshot | null>(null);
  const lastCloudUpdatedAtRef = useRef<string | null>(null);
  const syncConflictRefreshSequenceRef = useRef(0);
  const localDirtyRef = useRef(false);
  const pendingSyncConflictRef = useRef<PendingSyncConflict | null>(null);
  const legacyImportPendingRef = useRef(false);
  latestSnapshotRef.current = { boldText, appIcon, people, origins, expenses, hiddenExpensesByMonth, paidExpenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail, selectedPerson, reminderEnabled, reminderTime, reminderDay, billingCycleMigrationVersion: WESLY_FATURA_MIGRATION_VERSION };

  useEffect(() => {
    const saveBeforeLeaving = () => {
      const userId = userIdRef.current;
      const snapshot = latestSnapshotRef.current;
      if (userId && snapshot) saveLocalJsonBackup(userId, snapshot);
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") saveBeforeLeaving(); };
    window.addEventListener("pagehide", saveBeforeLeaving);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const title = accountLabel !== "usuário" ? `Finanças de ${accountLabel}` : "Finanças";
    document.title = title;
    const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    appTitle?.setAttribute("content", title);
    return () => {
      document.title = "Finanças";
      appTitle?.setAttribute("content", "Finanças");
    };
  }, [accountLabel]);

  useEffect(() => {
    const iconPath = `/icons/${appIcon}.svg?v=2`;
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute("href", iconPath);
    document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.setAttribute("href", iconPath);
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.setAttribute("href", `/manifests/${appIcon}.webmanifest?v=2`);
  }, [appIcon]);
  useEffect(() => {
    let active = true;
    const loadCloudState = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;
      if (userError || !user) {
        console.warn("[Supabase Auth] Usuário não autenticado:", userError?.message || "sessão ausente");
        return;
      }
      userIdRef.current = user.id;
      const metadata = user.user_metadata as { full_name?: string; name?: string } | undefined;
      setAccountLabel(metadata?.full_name?.trim() || metadata?.name?.trim() || user.email || "usuário");
      const { data, error } = await supabase.from("finance_state").select("payload, updated_at").eq("user_id", user.id).maybeSingle();
      if (!active) return;
      if (error) {
        console.warn("[Supabase] Não foi possível ler o estado online:", error.message);
        const localDraftKey = `finance-state-draft:${user.id}`;
        let localRecovery: Record<string, unknown> | null = null;
        try { localRecovery = JSON.parse(localStorage.getItem(localDraftKey) || "null") as Record<string, unknown> | null; } catch { localRecovery = null; }
        if (!isSnapshotRecord(localRecovery)) localRecovery = null;
        const localBackup = readNewestLocalJsonBackup(user.id);
        if (!localRecovery) localRecovery = localBackup?.snapshot || null;
        else if (localBackup) {
          const draftSavedAt = Number(localStorage.getItem(localDraftSavedAtKey(user.id)) || 0);
          const draftIsComplete = isSnapshotComplete(localRecovery);
          const backupIsComplete = isSnapshotComplete(localBackup.snapshot);
          const backupIsNewer = localBackup.savedAt > draftSavedAt;
          if (!draftIsComplete) {
            saveLocalJsonBackup(user.id, localRecovery as unknown as AppSnapshot);
            localRecovery = backupIsComplete && backupIsNewer ? localBackup.snapshot : mergeSnapshotWithFallback(localBackup.snapshot, localRecovery);
          } else if (backupIsComplete && backupIsNewer && !sameSnapshot(localBackup.snapshot, localRecovery)) {
            saveLocalJsonBackup(user.id, localRecovery as unknown as AppSnapshot);
            localRecovery = localBackup.snapshot;
          }
        }
        if (localRecovery) {
          const migration = migrateLegacyWeslyFaturaEntries(localRecovery);
          localStorage.setItem(localDraftKey, JSON.stringify(migration.payload));
          localStorage.setItem(localDraftSavedAtKey(user.id), String(Date.now()));
          lastCloudUpdatedAtRef.current = null;
          localDirtyRef.current = true;
          hydratingRef.current = false;
          skipNextPersistRef.current = false;
          applyPayloadToState(migration.payload as Record<string, unknown>);
          setCloudLoadError("");
          setCloudLoaded(true);
          notify("Dados locais carregados. O backup do aparelho foi preservado; a nuvem será conferida antes de sincronizar.");
          return;
        }
        const legacyState = readLegacyState();
        if (legacyState) {
          setLegacyRecoveryPayload(legacyState);
          setLegacyRecoveryError("");
          return;
        }
        setCloudLoadError("Não foi possível carregar seus dados salvos nem encontrar uma cópia local. Tente novamente quando houver conexão.");
        setCloudLoaded(true);
        return;
      }
      const loadedUpdatedAt = typeof data?.updated_at === "string" && Number.isFinite(Date.parse(data.updated_at)) ? data.updated_at : null;
      lastCloudUpdatedAtRef.current = loadedUpdatedAt;
      const localDraftKey = `finance-state-draft:${user.id}`;
      let localDraft: Record<string, unknown> | null = null;
      try { localDraft = JSON.parse(localStorage.getItem(localDraftKey) || "null") as Record<string, unknown> | null; } catch { localDraft = null; }
      if (!isSnapshotRecord(localDraft)) localDraft = null;
      const rawCloudState = data?.payload;
      const cloudState = rawCloudState && typeof rawCloudState === "object" && !Array.isArray(rawCloudState) && Object.keys(rawCloudState).length > 0
        ? rawCloudState as Record<string, unknown>
        : null;
      const localDraftNormalized = localDraft ? migrateLegacyWeslyFaturaEntries(localDraft).payload : null;
      const cloudStateNormalized = cloudState ? migrateLegacyWeslyFaturaEntries(cloudState).payload : null;
      const localDraftMatchesCloud = Boolean(localDraft && cloudStateNormalized && sameSnapshot(localDraftNormalized, cloudStateNormalized));
      if (localDraftMatchesCloud) {
        localStorage.removeItem(localDraftKey);
        localStorage.removeItem(localDraftSavedAtKey(user.id));
        localDraft = null;
      }
      let recoveredFromBackup = false;
      const backupResolutionMatchesCloud = Boolean(rawCloudState && typeof rawCloudState === "object" && !Array.isArray(rawCloudState) && localStorage.getItem(localBackupResolvedKey(user.id)) === stableStringify(rawCloudState));
      const localBackup = !backupResolutionMatchesCloud ? readNewestLocalJsonBackup(user.id) : null;
      const draftSavedAt = Number(localStorage.getItem(localDraftSavedAtKey(user.id)) || 0);
      const backupDiffersFromCloud = Boolean(localBackup && cloudStateNormalized && !sameSnapshot(migrateLegacyWeslyFaturaEntries(localBackup.snapshot).payload, cloudStateNormalized));
      const legacyStateWithoutCloud = !cloudState && !localDraft ? readLegacyState() : null;
      if (legacyStateWithoutCloud && !hasRecoverableSnapshotData(localBackup?.snapshot || null)) {
        setLegacyRecoveryPayload(legacyStateWithoutCloud);
        setLegacyRecoveryError("");
        return;
      }
      if (localBackup && !localDraft && (!cloudState || backupDiffersFromCloud)) {
        localDraft = localBackup.snapshot;
        recoveredFromBackup = true;
        localStorage.setItem(localDraftKey, JSON.stringify(localDraft));
        localStorage.setItem(localDraftSavedAtKey(user.id), String(Date.now()));
      } else if (localBackup && localDraft) {
        const backupIsNewer = localBackup.savedAt > draftSavedAt;
        if (!isSnapshotComplete(localDraft)) {
          saveLocalJsonBackup(user.id, localDraft as unknown as AppSnapshot);
          localDraft = isSnapshotComplete(localBackup.snapshot) && backupIsNewer ? localBackup.snapshot : mergeSnapshotWithFallback(localBackup.snapshot, localDraft);
          recoveredFromBackup = true;
          localStorage.setItem(localDraftKey, JSON.stringify(localDraft));
          localStorage.setItem(localDraftSavedAtKey(user.id), String(Date.now()));
        } else if (isSnapshotComplete(localBackup.snapshot) && backupIsNewer && !sameSnapshot(localBackup.snapshot, localDraft)) {
          saveLocalJsonBackup(user.id, localDraft as unknown as AppSnapshot);
          localDraft = localBackup.snapshot;
          recoveredFromBackup = true;
          localStorage.setItem(localDraftKey, JSON.stringify(localDraft));
          localStorage.setItem(localDraftSavedAtKey(user.id), String(Date.now()));
        }
      }
      if (!cloudState && !localDraft) {
        const legacyState = readLegacyState();
        if (legacyState) {
          setLegacyRecoveryPayload(legacyState);
          setLegacyRecoveryError("");
          return;
        }
      }
      if (localDraft && cloudStateNormalized && sameSnapshot(migrateLegacyWeslyFaturaEntries(localDraft).payload, cloudStateNormalized)) {
        localStorage.removeItem(localDraftKey);
        localStorage.removeItem(localDraftSavedAtKey(user.id));
        localDraft = null;
        recoveredFromBackup = false;
      }
      const hasSyncConflict = Boolean(localDraft && cloudState);
      const sourcePayload = (cloudState || localDraft) as Record<string, unknown> | null;
      if (!sourcePayload) {
        setCloudLoaded(true);
        return;
      }
      const migration = migrateLegacyWeslyFaturaEntries(sourcePayload);
      const cloudPayload = migration.payload as Record<string, unknown>;
      if (hasSyncConflict && localDraft) {
        queueSyncConflict({ localPayload: localDraft, remotePayload: cloudPayload, remoteUpdatedAt: loadedUpdatedAt });
      } else if (!cloudState && localDraft) {
        notify(recoveredFromBackup ? "Backup local recuperado; será sincronizado novamente na nuvem." : "Rascunho deste usuário recuperado do aparelho; será salvo novamente na nuvem.");
      }
      if (migration.moved > 0) notify(`${migration.moved} lançamento(s) de FATURA de Wesly foram reclassificados pela data da compra.`);
      hydratingRef.current = !(!hasSyncConflict && (!cloudState || migration.changed));
      skipNextPersistRef.current = false;
      applyPayloadToState(cloudPayload);
      const localBold = localStorage.getItem(`finance-bold:${user.id}`);
      if (localBold !== null) setBoldText(localBold === "true");
      const savedIcon = cloudPayload.appIcon;
      if (typeof savedIcon === "string" && appIconOptions.some((option) => option.id === savedIcon)) localStorage.setItem(`finance-app-icon:${user.id}`, savedIcon);
      setCloudLoaded(true);
    };
    void loadCloudState();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!cloudLoaded || cloudLoadError) return;
    if (hydratingRef.current) {
      hydratingRef.current = false;
      skipNextPersistRef.current = false;
      return;
    }
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (pendingSyncConflictRef.current) return;
    const payload: AppSnapshot = { boldText, appIcon, people, origins, expenses, hiddenExpensesByMonth, paidExpenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail, selectedPerson, reminderEnabled, reminderTime, reminderDay, billingCycleMigrationVersion: WESLY_FATURA_MIGRATION_VERSION };
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      undoSnapshotRef.current = null;
      setCanUndo(false);
    } else if (lastSnapshotRef.current) {
      undoSnapshotRef.current = lastSnapshotRef.current;
      setCanUndo(true);
    }
    lastSnapshotRef.current = payload;
    const userId = userIdRef.current;
    if (!userId) return;
    const localDraftKey = `finance-state-draft:${userId}`;
    // Grava imediatamente um rascunho e uma cópia versionada antes de tocar no Supabase.
    localDirtyRef.current = true;
    localStorage.setItem(localDraftKey, JSON.stringify(payload));
    localStorage.setItem(localDraftSavedAtKey(userId), String(Date.now()));
    saveLocalJsonBackup(userId, payload);
    notify("Salvando alteração...");
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: remoteState, error: remoteReadError } = await supabase.from("finance_state").select("payload, updated_at").eq("user_id", user.id).maybeSingle();
      if (remoteReadError) {
        console.warn("[Supabase] Não foi possível validar o estado remoto antes de salvar:", remoteReadError.message);
        notify("Não foi possível validar os dados antes de salvar. Tente novamente.");
        return;
      }
      const remotePayload = remoteState?.payload as Record<string, unknown> | null;
      if (hasAnyDetailedEntries(remotePayload) && !hasAnyDetailedEntries(payload)) {
        console.error("[Supabase] Gravação bloqueada: o novo estado não possui lançamentos, mas o estado remoto possui dados.");
        notify("Gravação bloqueada para proteger seus lançamentos. Atualize a página.");
        return;
      }
      const expectedUpdatedAt = remoteState?.updated_at || null;
      if (expectedUpdatedAt !== lastCloudUpdatedAtRef.current) {
        if (remotePayload && sameSnapshot(remotePayload, payload)) lastCloudUpdatedAtRef.current = expectedUpdatedAt;
        else {
          await refreshSyncConflict(user.id, payload as unknown as Record<string, unknown>);
          return;
        }
      }
      const saveResult = await compareAndSaveFinanceState(user.id, payload, expectedUpdatedAt);
      if (saveResult.error) {
        console.warn("[Supabase] Não foi possível salvar o estado online:", saveResult.error.message);
        notify("Não foi possível salvar esta alteração. Tente novamente.");
        return;
      }
      if (saveResult.conflict) {
        await refreshSyncConflict(user.id, payload as unknown as Record<string, unknown>);
        return;
      }
      lastCloudUpdatedAtRef.current = saveResult.updatedAt;
      const monthlyError = await saveMonthlySnapshots(user.id, payload, saveResult.updatedAt);
      if (monthlyError) {
        console.warn("[Supabase] Estado principal salvo, mas o snapshot mensal falhou:", monthlyError.message);
        notify("Dados principais salvos; não foi possível criar a cópia mensal.");
        return;
      }
      if (sameSnapshot(latestSnapshotRef.current, payload)) {
        localDirtyRef.current = false;
        localStorage.removeItem(localDraftKey);
        localStorage.removeItem(localDraftSavedAtKey(userId));
      } else {
        localDirtyRef.current = true;
      }
      if (legacyImportPendingRef.current) {
        legacyStorageKeys.forEach((key) => localStorage.removeItem(key));
        legacyImportPendingRef.current = false;
      }
      notify("Alteração salva no Supabase.");
      })();
    }, 350);
    return () => { if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current); };
  }, [cloudLoaded, cloudLoadError, boldText, appIcon, people, origins, expenses, hiddenExpensesByMonth, paidExpenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail, selectedPerson, reminderEnabled, reminderTime, reminderDay, syncConflict]);
  const salaryPerson = people[0] || "";
  const isSalaryPerson = Boolean(selectedPerson) && selectedPerson === salaryPerson;
  const summary = useMemo(() => summaries[currentMonth] || emptyMonthlySummary(), [summaries, currentMonth]);
  const selectedEntries = useMemo(() => entries.filter((entry) => entry.person === selectedPerson), [entries, selectedPerson]);
  const currentCalendarMonth = calendarMonth();
  const weslyCurrentInvoiceMonth = getWeslyCurrentInvoiceMonth();
  const currentInvoiceEntries = useMemo(() => collectCurrentInvoiceEntries(entries, archivedData, currentMonth, currentCalendarMonth, weslyCurrentInvoiceMonth), [currentCalendarMonth, weslyCurrentInvoiceMonth, currentMonth, entries, archivedData]);
  const weslyInvoiceEntries = useMemo(() => currentInvoiceEntries.filter((entry) => normalizedLabel(entry.person) === "WESLY"), [currentInvoiceEntries]);
  const selectedExpenses = useMemo(() => {
    if (normalizedLabel(selectedPerson) !== "WESLY" || currentMonth !== currentCalendarMonth) {
      return selectedEntries.reduce((sum, entry) => sum + entry.value, 0);
    }
    const currentMonthWithoutWeslyInvoice = selectedEntries
      .filter((entry) => !isWeslyFaturaEntry(entry.person, entry.origin, entry.expense))
      .reduce((sum, entry) => sum + entry.value, 0);
    const weslyInvoiceTotal = weslyInvoiceEntries.reduce((sum, entry) => sum + entry.value, 0);
    return currentMonthWithoutWeslyInvoice + weslyInvoiceTotal;
  }, [selectedEntries, selectedPerson, currentMonth, currentCalendarMonth, weslyInvoiceEntries]);
  const selectedCard = useMemo(() => normalizedLabel(selectedPerson) === "WESLY"
    ? weslyInvoiceEntries.reduce((sum, entry) => sum + entry.value, 0)
    : selectedEntries.filter((entry) => isCardOrigin(entry.origin)).reduce((sum, entry) => sum + entry.value, 0), [selectedPerson, selectedEntries, weslyInvoiceEntries]);
  const invoiceTotal = useMemo(() => currentInvoiceEntries.reduce((sum, entry) => sum + entry.value, 0), [currentInvoiceEntries]);
  const selectedSalary = isSalaryPerson ? summary.salary : 0;
  const leftover = isSalaryPerson && selectedExpenses > 0 ? selectedSalary - selectedExpenses : 0;
  const selectPerson = (name: string) => setSelectedPerson(name);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return selectedEntries;
    return selectedEntries.filter((entry) => `${entry.person} ${entry.origin} ${entry.expense}`.toLocaleLowerCase("pt-BR").includes(q));
  }, [selectedEntries, search]);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
  };
  const applyPayloadToState = (payload: Record<string, unknown>) => applyCloudState(payload, { setPeople, setOrigins, setExpenses, setHiddenExpensesByMonth, setPaidExpenses, setEntries, setArchivedMonths, setArchivedData, setSummaries, setIndicatorSettings, setPalette, setCurrentMonth, setAlertEmail, setSelectedPerson, setReminderEnabled, setReminderTime, setReminderDay, setBoldText, setAppIcon });
  const queueSyncConflict = (conflict: PendingSyncConflict, allowCurrentDeletion = false) => {
    const existing = pendingSyncConflictRef.current;
    if (existing?.remoteUpdatedAt) {
      if (!conflict.remoteUpdatedAt && !allowCurrentDeletion) return;
      if (conflict.remoteUpdatedAt) {
        const order = compareTimestamps(conflict.remoteUpdatedAt, existing.remoteUpdatedAt);
        if (order !== null && order < 0) return;
      }
    }
    const localPayload = conflict.localPayload;
    const nextConflict = { ...conflict, localPayload };
    pendingSyncConflictRef.current = nextConflict;
    setSyncConflict(nextConflict);
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    localDirtyRef.current = true;
    const userId = userIdRef.current;
    if (userId) {
      localStorage.setItem(`finance-state-draft:${userId}`, JSON.stringify(localPayload));
      localStorage.setItem(localDraftSavedAtKey(userId), String(Date.now()));
      saveLocalJsonBackup(userId, localPayload as unknown as AppSnapshot);
    }
    notify("Detectamos duas versões diferentes. Sua cópia local foi preservada; escolha qual manter.");
  };
  const refreshSyncConflict = async (userId: string, localPayload: Record<string, unknown>) => {
    const refreshSequence = ++syncConflictRefreshSequenceRef.current;
    const { data, error } = await supabase.from("finance_state").select("payload, updated_at").eq("user_id", userId).maybeSingle();
    if (refreshSequence !== syncConflictRefreshSequenceRef.current || userIdRef.current !== userId) return;
    if (error) {
      console.warn("[Supabase] Não foi possível reler a versão concorrente:", error.message);
      notify("Conflito detectado. O rascunho foi mantido neste aparelho; tente sincronizar novamente.");
      return;
    }
    const remotePayload = data?.payload && typeof data.payload === "object" && !Array.isArray(data.payload) ? data.payload as Record<string, unknown> : null;
    const remoteUpdatedAt = typeof data?.updated_at === "string" ? data.updated_at : null;
    const currentLocalPayload = (latestSnapshotRef.current as unknown as Record<string, unknown> | null) || localPayload;
    if (remotePayload && sameSnapshot(remotePayload, currentLocalPayload)) {
      lastCloudUpdatedAtRef.current = remoteUpdatedAt;
      localDirtyRef.current = false;
      localStorage.removeItem(`finance-state-draft:${userId}`);
      localStorage.removeItem(localDraftSavedAtKey(userId));
      if (pendingSyncConflictRef.current) {
        pendingSyncConflictRef.current = null;
        setSyncConflict(null);
      }
      notify("A outra sessão já salvou as mesmas alterações.");
      return;
    }
    queueSyncConflict({ localPayload: currentLocalPayload, remotePayload, remoteUpdatedAt }, true);
  };
  useEffect(() => {
    if (!cloudLoaded || cloudLoadError) return;
    const userId = userIdRef.current;
    if (!userId) return;
    let active = true;
    const localDraftKey = `finance-state-draft:${userId}`;

    const applyRemoteRow = (row: Record<string, unknown> | null) => {
      if (!active || !row || row.user_id !== userId) return;
      const remoteUpdatedAt = typeof row.updated_at === "string" && Number.isFinite(Date.parse(row.updated_at)) ? row.updated_at : null;
      const remotePayload = row.payload;
      if (remoteUpdatedAt === null) return;
      if (!remotePayload || typeof remotePayload !== "object" || Array.isArray(remotePayload)) return;
      const versionOrder = lastCloudUpdatedAtRef.current ? compareTimestamps(remoteUpdatedAt, lastCloudUpdatedAtRef.current) : 1;
      if (versionOrder !== null && versionOrder <= 0) return;
      syncConflictRefreshSequenceRef.current += 1;
      const remoteState = remotePayload as Record<string, unknown>;
      const currentSnapshot = latestSnapshotRef.current;
      if (currentSnapshot && sameSnapshot(currentSnapshot, remoteState)) {
        lastCloudUpdatedAtRef.current = remoteUpdatedAt;
        localDirtyRef.current = false;
        localStorage.removeItem(localDraftKey);
        localStorage.removeItem(localDraftSavedAtKey(userId));
        if (pendingSyncConflictRef.current) {
          pendingSyncConflictRef.current = null;
          setSyncConflict(null);
        }
        return;
      }
      if (currentSnapshot && hasAnyDetailedEntries(currentSnapshot as unknown as Record<string, unknown>) && !hasAnyDetailedEntries(remoteState)) {
        queueSyncConflict({ localPayload: currentSnapshot as unknown as Record<string, unknown>, remotePayload: remoteState, remoteUpdatedAt });
        return;
      }
      if (pendingSyncConflictRef.current || localDirtyRef.current || persistTimerRef.current) {
        const localConflictPayload = (currentSnapshot as unknown as Record<string, unknown> | null) || pendingSyncConflictRef.current?.localPayload || remoteState;
        queueSyncConflict({ localPayload: localConflictPayload, remotePayload: remoteState, remoteUpdatedAt });
        return;
      }
      localStorage.removeItem(localDraftKey);
      localStorage.removeItem(localDraftSavedAtKey(userId));

      const migration = migrateLegacyWeslyFaturaEntries(remoteState);
      const appliedPayload = (migration.payload || remoteState) as Record<string, unknown>;
      lastCloudUpdatedAtRef.current = remoteUpdatedAt;
      if (sameSnapshot(latestSnapshotRef.current, appliedPayload)) return;

      localDirtyRef.current = false;
      skipNextPersistRef.current = !migration.changed;
      lastSnapshotRef.current = appliedPayload as AppSnapshot;
      undoSnapshotRef.current = null;
      setCanUndo(false);
      applyPayloadToState(appliedPayload);
      notify("Painel atualizado em tempo real.");
    };

    const channel = supabase
      .channel(`finance-state-sync:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_state", filter: `user_id=eq.${userId}` }, (change) => {
        if (change.eventType === "DELETE") {
          const localPayload = latestSnapshotRef.current as unknown as Record<string, unknown> | null;
          if (localPayload) void refreshSyncConflict(userId, localPayload);
          return;
        }
        applyRemoteRow(change.new as Record<string, unknown> | null);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void supabase.from("finance_state").select("user_id, payload, updated_at").eq("user_id", userId).maybeSingle().then(({ data, error }) => {
            if (!active) return;
            if (error) console.warn("[Supabase Realtime] Não foi possível conferir o estado mais recente:", error.message);
            else if (data) applyRemoteRow(data as unknown as Record<string, unknown>);
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Supabase Realtime] Canal de sincronização indisponível:", status);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [cloudLoaded, cloudLoadError]);

  const syncNow = async () => {
    const userId = userIdRef.current;
    const payload = latestSnapshotRef.current;
    if (!userId || !payload || isSyncing) return;
    if (pendingSyncConflictRef.current) {
      notify("Escolha qual versão manter antes de sincronizar.");
      return;
    }
    setIsSyncing(true);
    const localDraftKey = `finance-state-draft:${userId}`;
    localDirtyRef.current = true;
    localStorage.setItem(localDraftKey, JSON.stringify(payload));
    localStorage.setItem(localDraftSavedAtKey(userId), String(Date.now()));
    notify("Sincronizando com o Supabase...");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user || user.id !== userId) throw new Error("Sessão não autenticada.");
      const { data: remoteState, error: remoteReadError } = await supabase.from("finance_state").select("payload, updated_at").eq("user_id", userId).maybeSingle();
      if (remoteReadError) throw remoteReadError;
      const remotePayload = remoteState?.payload as Record<string, unknown> | null;
      if (hasAnyDetailedEntries(remotePayload) && !hasAnyDetailedEntries(payload)) {
        notify("Sincronização bloqueada para proteger seus lançamentos.");
        return;
      }
      const expectedUpdatedAt = remoteState?.updated_at || null;
      if (expectedUpdatedAt !== lastCloudUpdatedAtRef.current) {
        if (remotePayload && sameSnapshot(remotePayload, payload)) lastCloudUpdatedAtRef.current = expectedUpdatedAt;
        else {
          await refreshSyncConflict(userId, payload as unknown as Record<string, unknown>);
          return;
        }
      }
      const saveResult = await compareAndSaveFinanceState(userId, payload, expectedUpdatedAt);
      if (saveResult.error) throw saveResult.error;
      if (saveResult.conflict) {
        await refreshSyncConflict(userId, payload as unknown as Record<string, unknown>);
        return;
      }
      lastCloudUpdatedAtRef.current = saveResult.updatedAt;
      const monthlyError = await saveMonthlySnapshots(userId, payload, saveResult.updatedAt);
      if (monthlyError) throw monthlyError;
      if (sameSnapshot(latestSnapshotRef.current, payload)) {
        localDirtyRef.current = false;
        localStorage.removeItem(localDraftKey);
        localStorage.removeItem(localDraftSavedAtKey(userId));
        notify("Sincronização concluída no Supabase.");
      } else {
        localDirtyRef.current = true;
        notify("Uma edição mais recente continua salva no aparelho.");
      }
      if (legacyImportPendingRef.current && sameSnapshot(latestSnapshotRef.current, payload)) {
        legacyStorageKeys.forEach((key) => localStorage.removeItem(key));
        legacyImportPendingRef.current = false;
      }
    } catch (error) {
      console.warn("[Supabase] Sincronização manual falhou:", error);
      notify("Não foi possível sincronizar. O rascunho local foi preservado.");
    } finally {
      setIsSyncing(false);
    }
  };
  const closeSettings = () => {
    setShowSettings(false);
    notify("Cores e configurações salvas.");
  };
  const toggleReminders = async () => {
    if (reminderEnabled) {
      setReminderEnabled(false);
      notify("Lembretes desativados. Salvando...");
      return;
    }
    if (!("Notification" in window)) {
      notify("Este navegador não oferece notificações push.");
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      notify("Permissão negada. Ative as notificações nas configurações do navegador.");
      return;
    }
    setReminderEnabled(true);
    notify(`Lembrete ativado para o dia ${reminderDay} de cada mês. Salvando...`);
  };

  const undoLastAction = () => {
    const snapshot = undoSnapshotRef.current;
    if (!snapshot) {
      notify("Não há nenhuma ação para desfazer.");
      return;
    }
    skipHistoryRef.current = true;
    setPeople(snapshot.people);
    setOrigins(snapshot.origins);
    setExpenses(snapshot.expenses);
    setHiddenExpensesByMonth(snapshot.hiddenExpensesByMonth || {});
    setPaidExpenses(snapshot.paidExpenses);
    setEntries(snapshot.entries);
    setArchivedMonths(snapshot.archivedMonths);
    setArchivedData(snapshot.archivedData);
    setSummaries(snapshot.summaries);
    setIndicatorSettings(snapshot.indicatorSettings);
    setPalette(snapshot.palette);
    setCurrentMonth(snapshot.currentMonth);
    setSelectedPerson(snapshot.selectedPerson);
    undoSnapshotRef.current = null;
    setCanUndo(false);
    notify("Última alteração desfeita.");
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input:not([type=\"color\"]), textarea, select, [contenteditable=\"true\"]");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !isEditing && canUndo) {
        event.preventDefault();
        undoLastAction();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [canUndo]);

  const openSalaryEditor = () => {
    if (selectedPerson !== salaryPerson) return;
    setSalaryDraft(String(summary.salary).replace(".", ","));
    setShowSalaryEditor(true);
  };

  const sendSalaryAlert = async (salary: number, month: string) => {
    if (!alertEmail.trim()) return;
    const { error } = await supabase.functions.invoke("send-salary-alert", { body: { to: alertEmail.trim(), month, salary } });
    if (error) notify("Salário salvo, mas o alerta por e-mail ainda precisa ser configurado.");
    else notify(`Alerta enviado para ${alertEmail.trim()}.`);
  };

  const saveSalary = () => {
    const salary = parseAmount(salaryDraft);
    if (!Number.isFinite(salary) || salary < 0) {
      notify("Informe um salário válido.");
      return;
    }
    setSummaries((current) => ({
      ...current,
      [currentMonth]: { ...(current[currentMonth] || { salary: 0, expenses: 0, card: 0 }), salary },
    }));
    setShowSalaryEditor(false);
    notify(`Salário de ${currentMonth} atualizado. Salvando...`);
  };

  useEffect(() => {
    if (!cloudLoaded) return;
    setShowMascot(true);
    const mascotTimer = window.setTimeout(() => setShowMascot(false), 8500);
    return () => window.clearTimeout(mascotTimer);
  }, [cloudLoaded]);
  useEffect(() => {
    if (!cloudLoaded || !reminderEnabled || !("Notification" in window)) return;
    const checkMonthEnd = () => {
      const userId = userIdRef.current;
      if (!userId || Notification.permission !== "granted") return;
      const now = new Date();
      const target = reminderTarget(now, reminderDay);
      if (target.month === calendarMonth() && now.getDate() === target.day) void showMonthEndReminder(userId, target.month);
    };
    checkMonthEnd();
    const timer = window.setInterval(checkMonthEnd, 60_000);
    return () => window.clearInterval(timer);
  }, [cloudLoaded, reminderEnabled, reminderDay]);
  // A abertura do app não troca o mês automaticamente. A troca automática
  // podia sobrescrever um mês arquivado ou uma recuperação local; o usuário
  // pode abrir o mês atual pelo botão "MÊS ATUAL".

  const updateCategory = (kind: "people" | "origins" | "expenses", index: number, nextName: string) => {
    const name = nextName.trim();
    if (!name) return;
    const setters = { people: setPeople, origins: setOrigins, expenses: setExpenses };
    setters[kind]((current) => current.map((item, itemIndex) => itemIndex === index ? name : item));
    if (kind === "people") {
      const previous = people[index];
      if (previous && previous !== name) {
        if (selectedPerson === previous) setSelectedPerson(name);
        setEntries((current) => current.map((entry) => entry.person === previous ? { ...entry, person: name } : entry));
        setArchivedData((current) => Object.fromEntries(Object.entries(current).map(([month, rows]) => [month, rows.map((entry) => entry.person === previous ? { ...entry, person: name } : entry)])));
      }
    } else {
      const previous = (kind === "origins" ? origins : expenses)[index];
      if (previous && previous !== name) {
        if (kind === "expenses") {
          setPaidExpenses((current) => {
            return renamePaidExpense(current, previous, name);
          });
          setHiddenExpensesByMonth((current) => Object.fromEntries(Object.entries(current).map(([month, hidden]) => [month, hidden.map((item) => item === previous ? name : item)])));
        }
        setEntries((current) => current.map((entry) => kind === "origins" ? (entry.origin === previous ? { ...entry, origin: name } : entry) : (entry.expense === previous ? { ...entry, expense: name } : entry)));
        setArchivedData((current) => Object.fromEntries(Object.entries(current).map(([month, rows]) => [month, rows.map((entry) => kind === "origins" ? (entry.origin === previous ? { ...entry, origin: name } : entry) : (entry.expense === previous ? { ...entry, expense: name } : entry))])));
      }
    }
  };
  const addCategory = (kind: "people" | "origins" | "expenses", name: string) => {
    const value = name.trim();
    if (!value) return;
    const lists = { people, origins, expenses };
    const setters = { people: setPeople, origins: setOrigins, expenses: setExpenses };
    if (!lists[kind].some((item) => item.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR"))) {
      setters[kind]((current) => [...current, value]);
      if (kind === "people" && people.length === 0) setSelectedPerson(value);
    }
    if (kind === "expenses") setHiddenExpensesByMonth((current) => ({ ...current, [currentMonth]: (current[currentMonth] || []).filter((item) => item.toLocaleLowerCase("pt-BR") !== value.toLocaleLowerCase("pt-BR")) }));
  };
  const removeCategory = (kind: "people" | "origins" | "expenses", index: number) => {
    const lists = { people, origins, expenses };
    const removed = lists[kind][index];
    const setters = { people: setPeople, origins: setOrigins, expenses: setExpenses };
    if (kind !== "expenses") setters[kind]((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (kind === "expenses") {
      // A despesa é ocultada somente no mês aberto. O nome continua disponível
      // nos demais meses e os lançamentos antigos permanecem no histórico.
      setHiddenExpensesByMonth((current) => ({ ...current, [currentMonth]: Array.from(new Set([...(current[currentMonth] || []), removed])) }));
      setPaidExpenses((current) => {
        const next = { ...current };
        delete next[paidExpenseKey(currentMonth, removed)];
        delete next[removed];
        return next;
      });
    }
    if (kind === "people" && selectedPerson === removed) setSelectedPerson(people.find((item) => item !== removed) || "");
  };
  const togglePaidExpense = (expense: string) => {
    notify("Salvando marcação da Lista...");
    setPaidExpenses((current) => togglePaidExpenseState(current, currentMonth, expense));
  };
  const toggleBoldText = () => setBoldText((current) => {
    const next = !current;
    const userId = userIdRef.current;
    if (userId) localStorage.setItem(`finance-bold:${userId}`, String(next));
    return next;
  });
  const chooseAppIcon = (next: AppIcon) => {
    setAppIcon(next);
    const userId = userIdRef.current;
    if (userId) localStorage.setItem(`finance-app-icon:${userId}`, next);
  };

  const requestNewMonth = () => setShowNewMonthConfirm(true);

  const resetAppState = () => {
    setTab("PAINEL");
    setAccountLabel("usuário");
    setPeople([]);
    setOrigins([]);
    setExpenses([]);
    setHiddenExpensesByMonth({});
    setPaidExpenses({});
    setSelectedPerson("");
    setCurrentMonth(calendarMonth());
    setArchivedMonths([]);
    setArchivedData({});
    setEntries([]);
    setSummaries({});
    setSearch("");
    setForm(emptyRegistrationForm());
    setShowNewMonthConfirm(false);
    setShowSettings(false);
    setShowSalaryEditor(false);
    setSalaryDraft("");
    setShowSalary(false);
    setIndicatorSettings({});
    setReminderEnabled(false);
    setReminderTime("20:00");
    setReminderDay(28);
    setPalette(defaultPalette);
    setBoldText(false);
    setAppIcon("finance-wallet");
    setCanUndo(false);
    lastSnapshotRef.current = null;
    undoSnapshotRef.current = null;
    localDirtyRef.current = false;
    lastCloudUpdatedAtRef.current = null;
    syncConflictRefreshSequenceRef.current += 1;
    pendingSyncConflictRef.current = null;
    legacyImportPendingRef.current = false;
    setSyncConflict(null);
    setLegacyRecoveryPayload(null);
    setLegacyRecoveryError("");
    setCloudLoadError("");
  };
  const downloadJsonBackup = () => {
    const userId = userIdRef.current;
    const snapshot = latestSnapshotRef.current;
    if (!userId || !snapshot) return;
    saveLocalJsonBackup(userId, snapshot);
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), userId, snapshot }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `financas-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("Backup JSON salvo no aparelho.");
  };
  const handleSignOut = async () => {
    if (pendingSyncConflictRef.current) {
      notify("Resolva o conflito entre as versões antes de sair.");
      return;
    }
    const userId = userIdRef.current;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    if (userId) {
      const payload: AppSnapshot = { boldText, appIcon, people, origins, expenses, hiddenExpensesByMonth, paidExpenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail, selectedPerson, reminderEnabled, reminderTime, reminderDay, billingCycleMigrationVersion: WESLY_FATURA_MIGRATION_VERSION };
      const localDraftKey = `finance-state-draft:${userId}`;
      localDirtyRef.current = true;
      localStorage.setItem(localDraftKey, JSON.stringify(payload));
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === userId) {
        const { data: remoteState, error: remoteReadError } = await supabase.from("finance_state").select("payload, updated_at").eq("user_id", userId).maybeSingle();
        if (remoteReadError) {
          console.warn("[Supabase] Não foi possível conferir os dados antes do logout:", remoteReadError.message);
          notify("Não foi possível salvar seus dados. Você continua conectado para tentar novamente.");
          return;
        }
        const expectedUpdatedAt = remoteState?.updated_at || null;
        if (expectedUpdatedAt !== lastCloudUpdatedAtRef.current) {
          const localPayload = payload as unknown as Record<string, unknown>;
          if (remoteState?.payload && sameSnapshot(remoteState.payload, payload)) lastCloudUpdatedAtRef.current = expectedUpdatedAt;
          else {
            await refreshSyncConflict(userId, localPayload);
            return;
          }
        }
        const saveResult = await compareAndSaveFinanceState(userId, payload, expectedUpdatedAt);
        if (saveResult.error) {
          console.warn("[Supabase] Não foi possível salvar antes do logout:", saveResult.error.message);
          notify("Não foi possível salvar seus dados. Você continua conectado para tentar novamente.");
          return;
        }
        if (saveResult.conflict) {
          await refreshSyncConflict(userId, payload as unknown as Record<string, unknown>);
          return;
        }
        lastCloudUpdatedAtRef.current = saveResult.updatedAt;
        if (sameSnapshot(latestSnapshotRef.current, payload)) {
          localDirtyRef.current = false;
          localStorage.removeItem(localDraftKey);
          localStorage.removeItem(localDraftSavedAtKey(userId));
        } else {
          localDirtyRef.current = true;
        }
      }
    }
    await supabase.auth.signOut();
    resetAppState();
    pendingSyncConflictRef.current = null;
    setSyncConflict(null);
    setLegacyRecoveryPayload(null);
    legacyImportPendingRef.current = false;
    userIdRef.current = null;
    setCloudLoaded(false);
  };
  const recoverLegacyData = () => {
    if (!legacyRecoveryPayload) return;
    const migration = migrateLegacyWeslyFaturaEntries(legacyRecoveryPayload);
    legacyImportPendingRef.current = true;
    hydratingRef.current = false;
    skipNextPersistRef.current = false;
    applyPayloadToState(migration.payload as Record<string, unknown>);
    setLegacyRecoveryPayload(null);
    setCloudLoaded(true);
    notify("Dados antigos carregados. Uma cópia local será feita antes da sincronização.");
  };
  const leaveLegacyRecovery = async () => {
    setLegacyRecoveryError("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLegacyRecoveryError("Não foi possível sair agora. Os dados antigos continuam preservados neste aparelho.");
      return;
    }
    resetAppState();
    userIdRef.current = null;
    legacyImportPendingRef.current = false;
    setLegacyRecoveryPayload(null);
    setCloudLoaded(false);
  };
  const resolveSyncConflict = (choice: "local" | "remote") => {
    const conflict = pendingSyncConflictRef.current;
    if (!conflict || (choice === "remote" && !conflict.remotePayload)) return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingSyncConflictRef.current = null;
    setSyncConflict(null);
    lastCloudUpdatedAtRef.current = conflict.remoteUpdatedAt;
    if (choice === "local") {
      const migration = migrateLegacyWeslyFaturaEntries(conflict.localPayload);
      localDirtyRef.current = true;
      skipNextPersistRef.current = false;
      hydratingRef.current = false;
      applyPayloadToState(migration.payload as Record<string, unknown>);
      notify("Rascunho restaurado. Ele será sincronizado e substituirá a versão online se ela não mudar novamente.");
      return;
    }
    const migration = migrateLegacyWeslyFaturaEntries(conflict.remotePayload as Record<string, unknown>);
    const remoteSnapshot = migration.payload as Record<string, unknown>;
    localDirtyRef.current = false;
    legacyImportPendingRef.current = false;
    skipNextPersistRef.current = !migration.changed;
    hydratingRef.current = false;
    const userId = userIdRef.current;
    if (userId) {
      localStorage.removeItem(`finance-state-draft:${userId}`);
      localStorage.removeItem(localDraftSavedAtKey(userId));
      localStorage.setItem(localBackupResolvedKey(userId), stableStringify(remoteSnapshot));
      saveLocalJsonBackup(userId, remoteSnapshot as unknown as AppSnapshot);
    }
    lastSnapshotRef.current = remoteSnapshot as unknown as AppSnapshot;
    undoSnapshotRef.current = null;
    setCanUndo(false);
    applyPayloadToState(remoteSnapshot);
    notify("Versão online aplicada. A cópia de segurança local não foi apagada.");
  };
  const settingsForPerson: IndicatorSettings = indicatorSettings[selectedPerson] || (isSalaryPerson
    ? { salary: true, expenses: true, leftover: true, card: true }
    : { salary: false, expenses: true, leftover: false, card: true });
  const updateIndicator = (key: IndicatorKey, visible: boolean) => setIndicatorSettings((current) => ({ ...current, [selectedPerson]: { ...(current[selectedPerson] || settingsForPerson), [key]: visible } }));
  const configurableIndicators: [IndicatorKey, string][] = isSalaryPerson ? [["salary", "Salário"], ["expenses", "Despesas"], ["leftover", "Sobrou"], ["card", "Gastos com cartão"]] : [["expenses", "Despesas"], ["card", "Gastos com cartão"]];
  const goToCurrentMonth = () => {
    const realMonth = calendarMonth();
    if (currentMonth === realMonth) { setTab("PAINEL"); notify(`Você já está no mês atual: ${realMonth}.`); return; }
    const targetEntries = archivedData[realMonth] || [];
    if (entries.length > 0) {
      setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
      setArchivedData((current) => ({ ...current, [currentMonth]: entries }));
    }
    setEntries(targetEntries);
    setSummaries((current) => ({ ...current, [realMonth]: current[realMonth] || emptyMonthlySummary() }));
    setCurrentMonth(realMonth);
    setTab("PAINEL");
    notify(`${currentMonth} arquivado. Mês atual aberto: ${realMonth}.`);
  };
  const switchMonth = (targetMonth: string) => {
    if (!targetMonth || targetMonth === currentMonth) return;
    // Capture the target before updating archivedData so the switch never
    // reads a stale React state value during the same event.
    const targetEntries = archivedData[targetMonth] || [];
    setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
    setArchivedData((current) => ({ ...current, [currentMonth]: entries }));
    setEntries(targetEntries);
    setCurrentMonth(targetMonth);
    setSearch("");
    setForm(emptyRegistrationForm());
    setTab("PAINEL");
    notify(`Mês alterado para ${targetMonth}.`);
  };

  const startNewMonth = () => {
    const next = nextMonth(currentMonth);
    setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
    setArchivedData((current) => ({ ...current, [currentMonth]: entries }));
    setEntries([]);
    setSummaries((current) => ({ ...current, [next]: current[next] || emptyMonthlySummary() }));
    setCurrentMonth(next);
    setTab("PAINEL");
    notify(`${currentMonth} arquivado. Novo mês: ${next}.`);
  };

  const recalculateMonth = (month: string, rows: Entry[], current: Record<string, MonthlySummary>) => {
    const previous = current[month] || emptyMonthlySummary();
    return { ...current, [month]: { ...previous, expenses: rows.reduce((sum, entry) => sum + entry.value, 0), card: rows.filter((entry) => isCardOrigin(entry.origin)).reduce((sum, entry) => sum + entry.value, 0) } };
  };
  const editEntry = (month: string, updated: Entry) => {
    const sourceRows = month === currentMonth ? entries : (archivedData[month] || []);
    const destinationMonth = isWeslyFaturaEntry(updated.person, updated.origin, updated.expense) && updated.purchaseDate
      ? invoiceMonthForCardDate(updated.purchaseDate) || month
      : month;
    if (destinationMonth === month) {
      const sourceUpdated = sourceRows.map((entry) => entry.id === updated.id ? updated : entry);
      if (month === currentMonth) setEntries(sourceUpdated);
      else setArchivedData((current) => ({ ...current, [month]: sourceUpdated }));
      setSummaries((current) => recalculateMonth(month, sourceUpdated, current));
    } else {
      const sourceRemaining = sourceRows.filter((entry) => entry.id !== updated.id);
      const destinationRows = destinationMonth === currentMonth ? entries : (archivedData[destinationMonth] || []);
      const destinationUpdated = [updated, ...destinationRows.filter((entry) => entry.id !== updated.id)];
      setEntries((current) => month === currentMonth ? sourceRemaining : destinationMonth === currentMonth ? destinationUpdated : current);
      setArchivedData((current) => {
        const next = { ...current };
        if (month === currentMonth) delete next[month];
        else next[month] = sourceRemaining;
        if (destinationMonth === currentMonth) delete next[destinationMonth];
        else next[destinationMonth] = destinationUpdated;
        return next;
      });
      setArchivedMonths((current) => destinationMonth === currentMonth || current.includes(destinationMonth) ? current : [destinationMonth, ...current]);
      setSummaries((current) => recalculateMonth(destinationMonth, destinationUpdated, recalculateMonth(month, sourceRemaining, current)));
    }
    notify("Lançamento atualizado. Salvando...");
  };
  const deleteEntry = (month: string, id: number) => {
    if (month === currentMonth) {
      const next = entries.filter((entry) => entry.id !== id);
      setEntries(next);
      setSummaries((current) => recalculateMonth(month, next, current));
    } else {
      const next = (archivedData[month] || []).filter((entry) => entry.id !== id);
      setArchivedData((current) => ({ ...current, [month]: next }));
      setSummaries((current) => recalculateMonth(month, next, current));
    }
    notify("Lançamento apagado. Salvando...");
  };

  const register = (event: FormEvent) => {
    event.preventDefault();
    const value = parseAmount(form.value);
    const person = form.person.trim();
    const origin = form.origin.trim();
    const expense = form.expense.trim();
    if (!person || !origin || !expense) {
      notify("Preencha pessoa, origem e despesa.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      notify("Informe um valor maior que zero. Use vírgula ou ponto.");
      return;
    }
    const cardOrigin = isCardOrigin(origin);
    const invoiceExpense = isInvoiceExpense(expense);
    if (cardOrigin !== invoiceExpense) {
      notify(cardOrigin ? "Para origem CARTÃO ou CARTÃO DE CRÉDITO, escolha despesa FATURA ou FUTURA." : "Para despesa FATURA ou FUTURA, escolha origem CARTÃO ou CARTÃO DE CRÉDITO.");
      return;
    }
    if (!cardOrigin && !isSimpleOrigin(origin)) {
      notify("Para uma despesa comum, escolha origem CONTA SIMPLES ou DESPESAS SIMPLES.");
      return;
    }
    const usesBillingCycle = isWeslyFaturaEntry(person, origin, expense);
    const purchaseDate = form.purchaseDate.trim();
    const invoiceMonth = usesBillingCycle ? invoiceMonthForCardDate(purchaseDate) : null;
    if (usesBillingCycle && !invoiceMonth) {
      notify("Informe uma data de compra válida para calcular a fatura.");
      return;
    }
    const entryMonth = invoiceMonth || currentMonth;
    const newEntry: Entry = { id: Date.now(), person, origin, expense, value, ...(usesBillingCycle ? { purchaseDate } : {}) };
    const monthRows = entryMonth === currentMonth ? entries : (archivedData[entryMonth] || []);
    const nextMonthRows = [newEntry, ...monthRows];
    if (entryMonth === currentMonth) setEntries(nextMonthRows);
    else {
      setArchivedData((current) => ({ ...current, [entryMonth]: nextMonthRows }));
      setArchivedMonths((current) => current.includes(entryMonth) ? current : [entryMonth, ...current]);
    }
    if (usesBillingCycle) setSelectedPerson(person);
    setSummaries((current) => recalculateMonth(entryMonth, nextMonthRows, current));
    setForm(emptyRegistrationForm());
    notify(usesBillingCycle ? `Fatura de Wesly atualizada em ${entryMonth} (fechamento dia ${WESLY_CARD_CLOSING_DAY}).` : "Registro adicionado. Salvando...");
    setTab("HISTÓRICO");
  };

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.userThemeActive = "true";
    root.style.setProperty("--user-theme-primary", palette.primary);
    return () => {
      delete root.dataset.userThemeActive;
      root.style.removeProperty("--user-theme-primary");
    };
  }, [palette.primary]);

  const dangerMode = isSalaryPerson && leftover <= 0;
  const activePalette = dangerMode ? dangerPalette : palette;
  const gradientAccent = dangerMode
    ? dangerPalette.card
    : isSalaryPerson && leftover > 0 ? palette.card
    : selectedExpenses > 0 ? palette.card : palette.background;
  const visibleExpenses = expenses.filter((expense) => !(hiddenExpensesByMonth[currentMonth] || []).includes(expense));

  if (legacyRecoveryPayload) return <div className="month-modal-backdrop" role="presentation"><div className="month-modal" role="dialog" aria-modal="true" aria-labelledby="legacy-recovery-title"><span className="modal-kicker">RECUPERAÇÃO DE DADOS</span><h2 id="legacy-recovery-title">Encontramos dados antigos neste aparelho</h2><p>Esses dados ainda não estão vinculados a uma conta. Eles continuam intactos; confirme que pertencem a <strong>{accountLabel}</strong> antes de importar.</p>{legacyRecoveryError && <p role="alert">{legacyRecoveryError}</p>}<div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => { void leaveLegacyRecovery(); }}>Sair e trocar de conta</button><button type="button" className="modal-confirm" onClick={recoverLegacyData}>Recuperar nesta conta</button></div></div></div>;
  if (!cloudLoaded) return <div className="auth-loading">Carregando seus dados salvos...</div>;
  if (cloudLoadError) return <div className="auth-loading">{cloudLoadError}</div>;
  return (
      <div className={`sheet-app ${boldText ? "strong-mode" : ""}`} style={{ "--theme-primary": activePalette.primary, "--theme-background": activePalette.background, "--theme-card": activePalette.card, "--theme-text": activePalette.text, "--theme-gradient-accent": gradientAccent } as React.CSSProperties}>
      <header className="sheet-topbar"><button className="sheet-brand account-button" type="button" onClick={() => setShowIconPicker(true)} aria-label="Escolher ícone do aplicativo" title="Escolher ícone"><span className="sheet-logo"><img src={`/icons/${appIcon}.svg`} alt="" /></span><span><strong>{selectedPerson || "Wesly"}</strong><small>{currentMonth}</small></span></button><div className="top-actions"><button type="button" className={`sync-now-button ${isSyncing ? "is-syncing" : ""}`} onClick={() => { void syncNow(); }} disabled={isSyncing} aria-label="Sincronizar agora" title={isSyncing ? "Sincronizando..." : "Sincronizar agora"}><RefreshCw size={15} /> <span>{isSyncing ? "Salvando" : "Sincronizar"}</span></button><button type="button" className={`bold-toggle ${boldText ? "active" : ""}`} onClick={toggleBoldText} aria-label="Alternar texto em negrito" title="Alternar negrito"><Bold size={15} /></button><button className="new-month-button" type="button" onClick={(event) => { event.preventDefault(); requestNewMonth(); }}>Novo mês</button><button className="undo-button" type="button" onClick={(event) => { event.preventDefault(); undoLastAction(); }} disabled={!canUndo} aria-label="Desfazer última ação" title="Desfazer última ação (Ctrl+Z)"><Undo2 size={16} /></button><button className="top-icon" type="button" onClick={(event) => { event.preventDefault(); setShowSettings(true); }} aria-label="Configurações"><Settings2 size={18} /></button><button className="top-icon sign-out-button" type="button" onClick={() => { void handleSignOut(); }} aria-label="Sair da conta" title="Sair"><LogOut size={18} /></button></div></header>
      {showIconPicker && <div className="icon-picker-backdrop" role="presentation" onClick={() => setShowIconPicker(false)}><div className="icon-picker-modal" role="dialog" aria-modal="true" aria-labelledby="icon-picker-title" onClick={(event) => event.stopPropagation()}><div className="icon-picker-heading"><strong id="icon-picker-title">Escolher ícone</strong><button type="button" onClick={() => setShowIconPicker(false)} aria-label="Fechar escolha de ícone"><X size={16} /></button></div><div className="icon-picker-options">{appIconOptions.map((option) => <button type="button" className={appIcon === option.id ? "selected" : ""} key={option.id} onClick={() => chooseAppIcon(option.id)}><img src={`/icons/${option.id}.svg`} alt="" /><span>{option.label}</span></button>)}</div><small>Salvo automaticamente nesta conta.</small></div></div>}
      <main className="sheet-main">
        <nav className="sheet-tabs" aria-label="Seções da planilha">{[["PAINEL", HomeIcon], ["REGISTRO", ClipboardList], ["HISTÓRICO", History], ["CATEGORIAS", BarChart3], ["LISTA", ClipboardList]].map(([name, Icon]) => <button key={name as string} className={tab === name ? "selected" : ""} type="button" onClick={(event) => { event.preventDefault(); setTab(name as string); }}><Icon size={16} /><span>{name as string}</span></button>)}</nav>
        {message && <div className="sheet-message" role="status">{message}</div>}
      {tab === "PAINEL" && <Dashboard people={people} settings={settingsForPerson} month={currentMonth} invoiceMonth={weslyCurrentInvoiceMonth} archivedMonths={archivedMonths} salary={selectedSalary} showSalary={showSalary} onToggleSalary={() => setShowSalary((current) => !current)} expenses={selectedExpenses} leftover={leftover} card={selectedCard} invoiceTotal={invoiceTotal} invoicePaid={isPaidExpense(paidExpenses, currentMonth, "FATURA")} isAccountHolder={isSalaryPerson} showMascot={showMascot} selectedPerson={selectedPerson} onPersonChange={selectPerson} onRegister={() => setTab("REGISTRO")} onHistory={() => setTab("HISTÓRICO")} onCurrentMonth={goToCurrentMonth} onEditSalary={openSalaryEditor} />}
        {tab === "REGISTRO" && <Register form={form} setForm={setForm} onSubmit={register} people={people} origins={origins} expenses={visibleExpenses} />}
        {tab === "HISTÓRICO" && <HistoryView entries={filteredEntries} allEntries={selectedEntries} invoiceMonth={weslyCurrentInvoiceMonth} invoiceEntries={currentInvoiceEntries} search={search} setSearch={setSearch} month={currentMonth} archivedMonths={archivedMonths} archivedData={archivedData} summaries={summaries} person={selectedPerson} onEdit={editEntry} onDelete={deleteEntry} onMonthChange={switchMonth} />}
        {tab === "CATEGORIAS" && <CategoriesView people={people} origins={origins} expenses={expenses} hiddenExpenses={hiddenExpensesByMonth[currentMonth] || []} onRename={updateCategory} onAdd={addCategory} onRemove={removeCategory} />}
      {tab === "LISTA" && <ExpenseListView month={currentMonth} salary={isSalaryPerson ? summary.salary : 0} entries={entries} weslyInvoiceEntries={weslyInvoiceEntries} selectedPerson={selectedPerson} expenses={visibleExpenses} paidExpenses={paidExpenses} onTogglePaid={togglePaidExpense} />}
      </main>
      {isSalaryPerson && <FinanceMascot leftover={leftover} activityKey={selectedExpenses} visible={showMascot} />}
      {showSalaryEditor && <div className="salary-editor-backdrop" role="presentation" onClick={() => setShowSalaryEditor(false)}><div className="salary-editor-modal" role="dialog" aria-modal="true" aria-labelledby="salary-editor-title" onClick={(event) => event.stopPropagation()}><span className="modal-kicker">EDITAR SALÁRIO</span><h2 id="salary-editor-title">Salário de {currentMonth}</h2><p>Altere o valor deste mês. O salário ficará salvo no histórico mensal do Supabase.</p><label className="field-label">VALOR DO SALÁRIO<input className="sheet-input" inputMode="decimal" autoFocus value={salaryDraft} onChange={(event) => setSalaryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveSalary(); }} /></label><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => setShowSalaryEditor(false)}>Cancelar</button><button type="button" className="modal-confirm" onClick={saveSalary}>Salvar salário</button></div></div></div>}
      {showSettings && <div className="settings-backdrop" role="presentation" onClick={() => setShowSettings(false)}><div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><div className="settings-heading"><div><span className="modal-kicker">CONFIGURAÇÕES</span><h2 id="settings-title">Indicadores de {selectedPerson}</h2></div><button type="button" className="settings-close" onClick={() => setShowSettings(false)} aria-label="Fechar configurações"><X size={18} /></button></div><p>Usuário logado possui salário e sobra. Os demais perfis mostram apenas despesas e cartão.</p><div className="settings-list">{configurableIndicators.map(([key, label]) => <label className={`settings-row settings-row-${key}`} key={key}><span>{label}</span><input type="checkbox" checked={settingsForPerson[key]} onChange={(event) => updateIndicator(key, event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>)}</div><div className="reminder-section"><span className="palette-title">LEMBRETE DE CONTAS</span><p>Escolha o dia para receber um aviso mensal e conferir as contas pagas.</p><div className="reminder-day-row"><label className="field-label">DIA DO MÊS<select className="sheet-input reminder-day-select" value={reminderDay} onChange={(event) => setReminderDay(Number(event.target.value))}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option value={day} key={day}>{day}</option>)}</select></label><button type="button" className="palette-reset reminder-toggle-button" onClick={() => { void toggleReminders(); }}>{reminderEnabled ? "Desativar" : "Ativar"}</button></div><small className="backup-note">Permita notificações no navegador. O atalho PWA precisa ser aberto pelo menos uma vez.</small></div><div className="palette-section"><span className="palette-title">PALETA DE CORES</span><p>Personalize o visual do sistema. As cores ficam salvas no Supabase.</p><div className="palette-preview" aria-label="Prévia do tema inteligente"><span style={{ background: palette.primary }} /><span style={{ background: palette.card }} /><span style={{ background: palette.background }} /><span style={{ background: palette.text }} /></div><p className="smart-palette-note">Uma única cor principal. O sistema combina automaticamente o fundo, os cartões e os textos para manter o contraste e a harmonia.</p><div className="palette-grid"><PalettePicker label="Cor principal do sistema" value={palette.primary} onChange={(value) => setPalette(smartPalette(value))} /></div><button type="button" className="palette-reset" onClick={() => setPalette(defaultPalette)}>Restaurar cores originais</button></div><button type="button" className="palette-reset backup-export-button" onClick={downloadJsonBackup}><Download size={15} /> Baixar backup JSON</button><small className="backup-note">Um backup local também é salvo automaticamente ao fechar ou colocar o app em segundo plano.</small><button type="button" className="settings-done" onClick={closeSettings}>Concluir</button></div></div>}
      {showNewMonthConfirm && <div className="month-modal-backdrop" role="presentation"><div className="month-modal" role="dialog" aria-modal="true" aria-labelledby="new-month-title"><span className="modal-kicker">ARQUIVAR MÊS</span><h2 id="new-month-title">Começar um novo mês?</h2><p>Os lançamentos de <strong>{currentMonth}</strong> serão salvos no histórico e a tela ficará pronta para {nextMonth(currentMonth)}.</p><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => setShowNewMonthConfirm(false)}>Cancelar</button><button type="button" className="modal-confirm" onClick={() => { setShowNewMonthConfirm(false); startNewMonth(); }}>Começar novo mês</button></div></div></div>}
      {syncConflict && <div className="month-modal-backdrop" role="presentation"><div className="month-modal" role="alertdialog" aria-modal="true" aria-labelledby="sync-conflict-title"><span className="modal-kicker">SINCRONIZAÇÃO</span><h2 id="sync-conflict-title">Há duas versões diferentes</h2><p>A cópia local (rascunho ou backup automático) foi preservada. Escolha qual versão manter. Restaurar a cópia local substituirá os dados online; os backups anteriores continuam no aparelho.</p><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => resolveSyncConflict("remote")} disabled={!syncConflict.remotePayload}>{syncConflict.remotePayload ? "Manter versão online" : "Versão online indisponível"}</button><button type="button" className="modal-confirm" onClick={() => resolveSyncConflict("local")}>Restaurar deste aparelho</button></div></div></div>}
    </div>
  );
}

function Dashboard({ people, settings, month, invoiceMonth, archivedMonths, salary, showSalary, onToggleSalary, expenses, leftover, card, invoiceTotal, invoicePaid, isAccountHolder, showMascot, selectedPerson, onPersonChange, onRegister, onHistory, onCurrentMonth, onEditSalary }: { people: string[]; settings: IndicatorSettings; month: string; invoiceMonth: string; archivedMonths: string[]; salary: number; showSalary: boolean; onToggleSalary: () => void; expenses: number; leftover: number; card: number; invoiceTotal: number; invoicePaid: boolean; isAccountHolder: boolean; showMascot: boolean; selectedPerson: string; onPersonChange: (name: string) => void; onRegister: () => void; onHistory: () => void; onCurrentMonth: () => void; onEditSalary: () => void }) {
  const face = expenses === 0 ? "😐" : leftover > 0 ? "🙂" : "😟";
  const faceLabel = expenses === 0 ? "Ainda sem lançamentos" : leftover > 0 ? "Saldo positivo" : "Atenção aos gastos";
  return (
    <section className="panel-view">
      <button type="button" className="month-chip" onClick={onCurrentMonth} aria-label="Abrir mês atual">MÊS ATUAL <strong>{month}</strong></button>
      <div className={`welcome-strip ${!settings.salary ? "without-salary" : ""} ${leftover < 0 ? "negative-balance" : ""}`}>
        <div className="welcome-copy"><span>Bem vindo,</span><select className="person-switcher" value={selectedPerson} onChange={(event) => onPersonChange(event.target.value)} aria-label="Selecionar nome"><option value="" disabled>{people.length ? "Selecione uma pessoa" : "Adicione uma pessoa em Categorias"}</option>{people.map((person) => <option key={person} value={person}>{person}</option>)}</select><ChevronDown size={15} /></div>
        {settings.salary && <Metric label="Salário" value={salary} visible={showSalary} onToggleVisibility={onToggleSalary} editable onClick={onEditSalary} />}
        {settings.expenses && <Metric label="Despesas" value={expenses} tone="danger" />}
        {settings.leftover && <Metric label="Sobrou" value={leftover} tone={leftover > 0 ? "positive" : "danger"} />}
        {settings.card && <Metric label="Gastos com cartão" value={card} tone="danger" />}
        {settings.card && isAccountHolder && <Metric label={`Fatura atual · ${invoiceMonth}`} value={invoiceTotal} tone={invoicePaid ? "positive" : "danger"} />}
      </div>
      <div className="dashboard-actions"><button type="button" onClick={(event) => { event.preventDefault(); onRegister(); }} className={`green-action ${leftover < 0 ? "danger-action" : ""}`}><CirclePlus size={19} /> Registrar despesa</button><button type="button" onClick={(event) => { event.preventDefault(); onHistory(); }} className="light-action"><History size={18} /> Ver histórico</button></div>
      <div className="balance-face" aria-label={`Status financeiro: ${faceLabel}`}><span aria-hidden="true">{face}</span><small>{faceLabel}</small></div>
    </section>
  );
}

function Metric({ label, value, visible = true, onToggleVisibility, editable, onClick, tone }: { label: string; value: number; visible?: boolean; onToggleVisibility?: () => void; editable?: boolean; onClick?: () => void; tone?: "danger" | "positive" }) {
  const metricClassName = tone ? `metric metric-tone-${tone}` : "metric";
  const content = <><span>{label}{editable && <small className="metric-edit-hint"> editar</small>}{onToggleVisibility && <button type="button" className="salary-visibility-button" onClick={(event) => { event.stopPropagation(); onToggleVisibility(); }} aria-label={visible ? "Ocultar salário" : "Mostrar salário"} title={visible ? "Ocultar salário" : "Mostrar salário"}>{visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>}</span><strong>{visible ? brl.format(value) : "R$ •••••"}</strong></>;
  return editable ? <div className={`${metricClassName} metric-editable`} onClick={onClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onClick?.(); }} role="button" tabIndex={0} aria-label={`Editar ${label}`}>{content}</div> : <div className={metricClassName}>{content}</div>;
}

function PalettePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { h, s, l } = hexToHsl(value);
  const pickGradientColor = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && event.buttons === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const lightness = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
    onChange(hslToHex(h, saturation, lightness));
  };
  return <div className="palette-picker"><div className="palette-picker-label"><span>{label}</span><code>{value.toUpperCase()}</code></div><div className="palette-gradient-square" style={{ backgroundColor: `hsl(${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)` }} onPointerDown={pickGradientColor} onPointerMove={pickGradientColor} role="slider" aria-label={`${label}: saturação e luminosidade`} aria-valuetext={value}><span className="palette-picker-marker" style={{ left: `${s * 100}%`, top: `${(1 - l) * 100}%` }} /></div><input className="palette-hue-slider" type="range" min="0" max="360" value={h} onChange={(event) => onChange(hslToHex(Number(event.target.value), s || 1, l))} aria-label={`${label}: matiz`} /><label className="palette-color-input"><span>Escolher cor</span><input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} /></label></div>;
}
function Register({ form, setForm, onSubmit, people, origins, expenses }: { people: string[]; origins: string[]; expenses: string[]; form: ExpenseForm; setForm: React.Dispatch<React.SetStateAction<ExpenseForm>>; onSubmit: (event: FormEvent) => void }) {
  const choose = (field: "person" | "origin" | "expense", value: string) => setForm((current) => ({ ...current, [field]: value }));
  const hasWeslyFatura = isWeslyFaturaEntry(form.person, form.origin, form.expense);
  const invoiceMonth = hasWeslyFatura ? invoiceMonthForCardDate(form.purchaseDate) : null;
  return (
    <section className="register-view">
      <div className="section-title"><span>REGISTRO</span><h1>Adicionar despesa</h1><p>Cartão combina com FATURA/FUTURA; outras despesas usam conta simples. A fatura de Wesly é definida pela data da compra.</p></div>
      <form className="register-card" onSubmit={onSubmit}>
        <Field label="PESSOA"><Select value={form.person} placeholder="Selecione uma pessoa" options={people} onChange={(value) => choose("person", value)} /></Field>
        <Field label="ORIGEM"><Select value={form.origin} placeholder="Selecione a origem" options={origins} onChange={(value) => choose("origin", value)} /></Field>
        <Field label="DESPESA"><Select value={form.expense} placeholder="Selecione uma despesa" options={expenses} onChange={(value) => choose("expense", value)} /></Field>
        {hasWeslyFatura && <Field label="DATA DA COMPRA"><input className="sheet-input" type="date" required value={form.purchaseDate} onChange={(event) => setForm((current) => ({ ...current, purchaseDate: event.target.value }))} /></Field>}
        {hasWeslyFatura && <p className="card-cycle-note">{invoiceMonth ? <>Esta compra entra na fatura de <strong>{invoiceMonth}</strong> (fecha dia {WESLY_CARD_CLOSING_DAY}).</> : "Informe uma data de compra válida."}</p>}
        <label className="field-label">VALOR<input className="sheet-input" inputMode="decimal" placeholder="R$ 0,00" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></label>
        <button className="register-button" type="submit">REGISTRAR</button>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field-label">{label}{children}</label>; }
function Select({ value, placeholder, options, onChange }: { value: string; placeholder: string; options: string[]; onChange: (value: string) => void }) { return <div className="select-wrap"><select className="sheet-input" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={15} /></div>; }
function QuickChoices({ options, value, onChoose }: { options: string[]; value: string; onChoose: (value: string) => void }) { return options.length > 0 ? <div className="quick-choices" aria-label="Itens usados recentemente">{options.slice(0, 8).map((option) => <button type="button" className={option === value ? "selected" : ""} key={option} onClick={() => onChoose(option)}>{option}</button>)}</div> : <small className="quick-choices-empty">Adicione itens em Categorias</small>; }

function HistoryView({ entries, allEntries, invoiceMonth, invoiceEntries, search, setSearch, month, archivedMonths, archivedData, summaries, person, onEdit, onDelete, onMonthChange }: { entries: Entry[]; allEntries: Entry[]; invoiceMonth: string; invoiceEntries: InvoiceEntry[]; search: string; setSearch: (value: string) => void; month: string; archivedMonths: string[]; archivedData: Record<string, Entry[]>; summaries: Record<string, MonthlySummary>; person: string; onEdit: (month: string, entry: Entry) => void; onDelete: (month: string, id: number) => void; onMonthChange: (month: string) => void }) {
  const [exportMonth, setExportMonth] = useState(month);
  const [exportMessage, setExportMessage] = useState("");
  const [invoicePersonFilter, setInvoicePersonFilter] = useState("");
  const [editing, setEditing] = useState<{ month: string; entry: Entry } | null>(null);
  const [draft, setDraft] = useState<Entry | null>(null);
  const [valueDraft, setValueDraft] = useState("");
  const [editError, setEditError] = useState("");
  const startEdit = (archiveMonth: string, entry: HistoryRowEntry) => {
    const editableEntry = { ...entry };
    delete editableEntry.sourceMonth;
    setEditing({ month: archiveMonth, entry: editableEntry });
    setDraft(editableEntry);
    setValueDraft(entry.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setEditError("");
  };
  const closeEdit = () => { setEditing(null); setDraft(null); setValueDraft(""); setEditError(""); };
  const saveEdit = () => {
    const value = parseAmount(valueDraft);
    if (editing && draft && draft.person.trim() && draft.origin.trim() && draft.expense.trim() && Number.isFinite(value) && value > 0) {
      const updated = { ...draft, value, person: draft.person.trim(), origin: draft.origin.trim(), expense: draft.expense.trim() };
      if (isWeslyFaturaEntry(updated.person, updated.origin, updated.expense) && !invoiceMonthForCardDate(updated.purchaseDate || "")) {
        setEditError("Informe uma data de compra válida para calcular a fatura.");
        return;
      }
      if (!updated.purchaseDate) delete updated.purchaseDate;
      onEdit(editing.month, updated);
      closeEdit();
    }
  };
  const rows = (items: HistoryRowEntry[], rowMonth: string, readOnly = false, onPersonClick?: (name: string) => void) => items.map((entry, index) => {
    const sourceMonth = entry.sourceMonth || rowMonth;
    const personCell = onPersonClick ? <button type="button" className="invoice-person-filter-button" aria-pressed={normalizedLabel(invoicePersonFilter) === normalizedLabel(entry.person)} aria-label={`Filtrar fatura por ${entry.person}`} onClick={() => onPersonClick(entry.person)}>{entry.person}</button> : entry.person;
    return <div className="table-row history-row" key={`${rowMonth}-${entry.id}-${index}`}><span>{personCell}</span><span>{entry.origin}</span><span className="history-expense-cell">{entry.expense}{entry.purchaseDate && <small>Compra em {formatPurchaseDate(entry.purchaseDate)}</small>}</span><strong>{brl.format(entry.value)}</strong><div className="row-actions">{!readOnly && <><button type="button" onClick={() => startEdit(sourceMonth, entry)} aria-label="Editar lançamento"><Pencil size={14} /></button><button type="button" onClick={() => onDelete(sourceMonth, entry.id)} aria-label="Apagar lançamento"><Trash2 size={14} /></button></>}</div></div>;
  });
  const isWeslySelected = normalizedLabel(person) === "WESLY";
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const visibleInvoiceEntries = isWeslySelected ? invoiceEntries.filter((entry) => {
    const matchesPerson = !invoicePersonFilter || normalizedLabel(entry.person) === normalizedLabel(invoicePersonFilter);
    const matchesQuery = !query || `${entry.person} ${entry.origin} ${entry.expense}`.toLocaleLowerCase("pt-BR").includes(query);
    return matchesPerson && matchesQuery;
  }) : [];
  const visibleMonthEntries = isWeslySelected && month === invoiceMonth
    ? entries.filter((entry) => !isWeslyFaturaEntry(entry.person, entry.origin, entry.expense))
    : entries;
  // Older states can have the month recorded in only one of these
  // structures. Show the union so a saved month is never hidden by a
  // partial archive, while preserving the current month first.
  const monthOptions = Array.from(new Set([
    month,
    ...(isWeslySelected ? [invoiceMonth] : []),
    ...archivedMonths,
    ...Object.keys(archivedData),
    ...Object.keys(summaries),
  ].filter(Boolean)));
  useEffect(() => {
    if (!monthOptions.includes(exportMonth)) setExportMonth(month);
  }, [month, exportMonth, monthOptions.join("|")]);
  useEffect(() => {
    setInvoicePersonFilter("");
  }, [person, invoiceMonth]);
  const exportEntries = (exportMonth === month ? allEntries : (archivedData[exportMonth] || [])).filter((entry) => entry.person === person);
  const exportSpreadsheet = () => {
    const csvRows = [["MÊS", exportMonth], [], ["PESSOA", "ORIGEM", "DESPESA", "DATA DA COMPRA", "VALOR"], ...exportEntries.map((entry) => [entry.person, entry.origin, entry.expense, entry.purchaseDate ? formatPurchaseDate(entry.purchaseDate) : "", entry.value.toFixed(2).replace(".", ",")]), [], ["TOTAL", "", "", "", exportEntries.reduce((sum, entry) => sum + entry.value, 0).toFixed(2).replace(".", ",")]];
    const csv = "\ufeff" + csvRows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `historico-${exportMonth.toLocaleLowerCase().replaceAll(" ", "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExportMessage(`${exportMonth} exportado com ${exportEntries.length} lançamento(s).`);
    window.setTimeout(() => setExportMessage(""), 2800);
  };
  return (
    <section className="history-view">
      <div className="section-title"><span>HISTÓRICO</span><h1>Lançamentos registrados</h1><p>Registros de {month} para {person}. A fatura atual reúne os lançamentos FATURA de todos os perfis, separada do mês-calendário.</p></div>
      <div className="history-month-picker"><label className="field-label">VISUALIZAR MÊS<select className="export-month-select" value={month} onChange={(event) => onMonthChange(event.target.value)} aria-label="Abrir outro mês">{monthOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div>
      {isWeslySelected && (
        <div className="card-invoice-panel">
          <div className="card-invoice-heading"><div><span>FATURA ATUAL · TODOS OS PERFIS</span><strong>{invoiceMonth}</strong></div><small>Fecha dia {WESLY_CARD_CLOSING_DAY} · total {brl.format(invoiceEntries.reduce((sum, entry) => sum + entry.value, 0))}</small></div>
          <div className="invoice-person-filter-status" role="status"><span>{invoicePersonFilter ? <>Filtrando por <strong>{invoicePersonFilter}</strong>; o total acima continua incluindo todos os perfis.</> : "Toque no nome de uma pessoa para filtrar os lançamentos."}</span>{invoicePersonFilter && <button type="button" onClick={() => setInvoicePersonFilter("")}>Mostrar todos</button>}</div>
          <div className="history-table">
            <div className="table-head"><span>PESSOA</span><span>ORIGEM</span><span>DESPESA</span><span>VALOR</span><span>AÇÃO</span></div>
            {rows(visibleInvoiceEntries, invoiceMonth, false, (name) => setInvoicePersonFilter((current) => normalizedLabel(current) === normalizedLabel(name) ? "" : name))}
            {visibleInvoiceEntries.length === 0 && <div className="no-results">{invoicePersonFilter ? `Nenhum lançamento de FATURA para ${invoicePersonFilter} que corresponda à busca.` : `Nenhum lançamento de FATURA em ${invoiceMonth}.`}</div>}
          </div>
        </div>
      )}
      <div className="export-panel"><div><span>EXPORTAR PLANILHA</span><strong>Escolha o mês desejado</strong></div><div className="export-controls"><select className="export-month-select" value={exportMonth} onChange={(event) => setExportMonth(event.target.value)} aria-label="Mês para exportar">{monthOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><button type="button" className="export-button" onClick={exportSpreadsheet}><Download size={16} /> Exportar</button></div></div>
      {exportMessage && <div className="export-message" role="status">{exportMessage}</div>}
      <div className="history-toolbar"><div className="sheet-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar pessoa, origem ou despesa" />{search && <button type="button" onClick={(event) => { event.preventDefault(); setSearch(""); }} aria-label="Limpar pesquisa"><X size={15} /></button>}</div></div>
      <div className="history-table"><div className="table-head"><span>PESSOA</span><span>ORIGEM</span><span>DESPESA</span><span>VALOR</span><span>AÇÃO</span></div>{rows(visibleMonthEntries, month)}{visibleMonthEntries.length === 0 && <div className="no-results">Nenhum registro registrado em {month}.</div>}</div>
      {editing && draft && <div className="edit-entry-backdrop" role="presentation" onClick={closeEdit}><div className="edit-entry-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><span className="modal-kicker">EDITAR LANÇAMENTO</span><h2>{editing.month}</h2><input value={draft.person} onChange={(event) => { setDraft({ ...draft, person: event.target.value }); setEditError(""); }} aria-label="Pessoa" /><input value={draft.origin} onChange={(event) => { setDraft({ ...draft, origin: event.target.value }); setEditError(""); }} aria-label="Origem" /><input value={draft.expense} onChange={(event) => { setDraft({ ...draft, expense: event.target.value }); setEditError(""); }} aria-label="Despesa" />{(draft.purchaseDate || isWeslyFaturaEntry(draft.person, draft.origin, draft.expense)) && <><input type="date" value={draft.purchaseDate || ""} onChange={(event) => { setDraft({ ...draft, purchaseDate: event.target.value }); setEditError(""); }} aria-label="Data da compra" />{isWeslyFaturaEntry(draft.person, draft.origin, draft.expense) && invoiceMonthForCardDate(draft.purchaseDate || "") && <small className="card-cycle-note">Esta compra entra na fatura de {invoiceMonthForCardDate(draft.purchaseDate || "")}.</small>}</>}{editError && <p role="alert">{editError}</p>}<input inputMode="decimal" value={valueDraft} onChange={(event) => setValueDraft(event.target.value)} onBlur={() => { const parsed = parseAmount(valueDraft); if (Number.isFinite(parsed)) setValueDraft(parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }} aria-label="Valor" /><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={closeEdit}>Cancelar</button><button type="button" className="modal-confirm" onClick={saveEdit}>Salvar</button></div></div></div>}
    </section>
  );
}

function CategoriesView({ people, origins, expenses, hiddenExpenses, onRename, onAdd, onRemove }: { people: string[]; origins: string[]; expenses: string[]; hiddenExpenses: string[]; onRename: (kind: "people" | "origins" | "expenses", index: number, name: string) => void; onAdd: (kind: "people" | "origins" | "expenses", name: string) => void; onRemove: (kind: "people" | "origins" | "expenses", index: number) => void }) {
return <section className="categories-view"><div className="section-title"><span>CATEGORIAS</span><h1>Listas editáveis</h1><p>Altere qualquer nome; a mudança é salva e atualiza os registros do sistema.</p></div><div className="category-columns"><Category title="PESSOAS" kind="people" items={people} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /><Category title="ORIGEM" kind="origins" items={origins} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /><Category title="DESPESAS" kind="expenses" items={expenses} hiddenItems={hiddenExpenses} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /></div></section>;
}

function ExpenseListView({ month, salary, entries, weslyInvoiceEntries, selectedPerson, expenses, paidExpenses, onTogglePaid }: { month: string; salary: number; entries: Entry[]; weslyInvoiceEntries: InvoiceEntry[]; selectedPerson: string; expenses: string[]; paidExpenses: Record<string, boolean>; onTogglePaid: (expense: string) => void }) {
  const expenseTotalFor = (expense: string) => {
    if (normalizedLabel(selectedPerson) === "WESLY" && isInvoiceExpense(expense)) {
      return weslyInvoiceEntries.reduce((sum, entry) => sum + entry.value, 0);
    }
    return entries.filter((entry) => entry.expense === expense).reduce((sum, entry) => sum + entry.value, 0);
  };
  const firstInvoiceCategory = expenses.findIndex(isInvoiceExpense);
  const displayedExpenses = expenses.filter((expense, index) => !isInvoiceExpense(expense) || index === firstInvoiceCategory);
  const paidTotal = displayedExpenses.reduce((sum, expense) => isPaidExpense(paidExpenses, month, expense) ? sum + expenseTotalFor(expense) : sum, 0);
  const remainingSalary = salary - paidTotal;
  return (
    <section className="categories-view">
      <div className="section-title"><h1>Controle de despesas</h1></div>
      <div className="list-salary-summary">
        <span>SALÁRIO PARA ORGANIZAÇÃO</span>
        <strong>{brl.format(remainingSalary)}</strong>
      </div>
      <div className="paid-expenses-list">
        {displayedExpenses.map((expense) => {
          const paid = isPaidExpense(paidExpenses, month, expense);
          const expenseTotal = expenseTotalFor(expense);
          return (
            <label className={`paid-expense-row ${paid ? "is-paid" : ""}`} key={expense}>
              <input type="checkbox" checked={paid} onChange={() => onTogglePaid(expense)} aria-label={`${paid ? "Desmarcar" : "Marcar"} ${expense} como já pago em ${month}`} />
              <span className="paid-expense-action">{paid ? "Pago" : "Pendente"}</span>
              <span className="paid-expense-name">{expense}</span>
              <strong>{brl.format(expenseTotal)}</strong>
            </label>
          );
        })}
      </div>
    </section>
  );
}
function Category({ title, kind, items, hiddenItems = [], onRename, onAdd, onRemove }: { title: string; kind: "people" | "origins" | "expenses"; items: string[]; hiddenItems?: string[]; onRename: (kind: "people" | "origins" | "expenses", index: number, name: string) => void; onAdd: (kind: "people" | "origins" | "expenses", name: string) => void; onRemove: (kind: "people" | "origins" | "expenses", index: number) => void }) {
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const finishRename = (index: number) => {
    const draft = drafts[index];
    if (draft === undefined) return;
    const name = draft.trim();
    if (name && name !== items[index]) onRename(kind, index, name);
    setDrafts((current) => { const next = { ...current }; delete next[index]; return next; });
  };
  return <div className="category-card"><h2>{title}</h2>{items.map((item, index) => hiddenItems.includes(item) ? null : <div className="category-edit-row" key={`${kind}-${index}`}><input value={drafts[index] ?? item} onChange={(event) => setDrafts((current) => ({ ...current, [index]: event.target.value }))} onBlur={() => finishRename(index)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} aria-label={`Editar ${title.toLocaleLowerCase()} ${index + 1}`} /><button type="button" onClick={() => onRemove(kind, index)} aria-label={`Excluir ${item}`}>×</button></div>)}<form className="category-add" onSubmit={(event) => { event.preventDefault(); onAdd(kind, newName); setNewName(""); }}><input value={newName} onChange={(event) => setNewName((event.target as HTMLInputElement).value)} placeholder="Adicionar novo" /><button type="submit">Adicionar</button></form></div>;
}
