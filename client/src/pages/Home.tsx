import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, ChevronDown, CirclePlus, ClipboardList, History, Home as HomeIcon, Plus, Search, Settings2, Download, X, Pencil, Trash2, Undo2, LogOut, Eye, EyeOff, Bold } from "lucide-react";

type Entry = { id: number; person: string; origin: string; expense: string; value: number };
type MonthlySummary = { salary: number; expenses: number; card: number };
type IndicatorKey = "salary" | "expenses" | "leftover" | "card";
type IndicatorSettings = Record<IndicatorKey, boolean>;
type ThemePalette = { primary: string; background: string; card: string; text: string };
const emptyMonthlySummary = (): MonthlySummary => ({ salary: 0, expenses: 0, card: 0 });

const defaultPalette: ThemePalette = { primary: "#2e6f25", background: "#f5f8f3", card: "#e4f5df", text: "#2f3c2d" };
const dangerPalette: ThemePalette = { primary: "#b42318", background: "#fff5f4", card: "#fbe3e0", text: "#4a1713" };
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
type AppSnapshot = { boldText: boolean; people: string[]; origins: string[]; expenses: string[]; paidExpenses: Record<string, boolean>; entries: Entry[]; archivedMonths: string[]; archivedData: Record<string, Entry[]>; summaries: Record<string, MonthlySummary>; indicatorSettings: Record<string, IndicatorSettings>; palette: ThemePalette; currentMonth: string; alertEmail: string; selectedPerson: string; reminderEnabled: boolean; reminderTime: string };

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
  try {
    const value = {
      people: JSON.parse(localStorage.getItem("wesly-people") || "null"),
      origins: JSON.parse(localStorage.getItem("wesly-origins") || "null"),
      expenses: JSON.parse(localStorage.getItem("wesly-expenses") || "null"),
      currentMonth: localStorage.getItem("wesly-current-month"),
      archivedMonths: JSON.parse(localStorage.getItem("wesly-archived-months") || "null"),
      archivedData: JSON.parse(localStorage.getItem("wesly-archived-data") || "null"),
      entries: JSON.parse(localStorage.getItem("wesly-current-entries") || "null"),
      summaries: JSON.parse(localStorage.getItem("wesly-monthly-summaries") || "null"),
      indicatorSettings: JSON.parse(localStorage.getItem("wesly-indicator-settings") || "null"),
    };
    return Object.values(value).some((item) => item !== null) ? value : null;
  } catch {
    return null;
  }
}

function applyCloudState(payload: Record<string, unknown> | null, setters: {
  setPeople: (value: string[]) => void;
  setOrigins: (value: string[]) => void;
  setExpenses: (value: string[]) => void;
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
  setBoldText: (value: boolean) => void;
}) {
  if (!payload) return;
  if (Array.isArray(payload.people)) setters.setPeople(payload.people as string[]);
  if (Array.isArray(payload.origins)) setters.setOrigins(payload.origins as string[]);
  if (Array.isArray(payload.expenses)) setters.setExpenses(payload.expenses as string[]);
  if (payload.paidExpenses && typeof payload.paidExpenses === "object") setters.setPaidExpenses(payload.paidExpenses as Record<string, boolean>);
  if (Array.isArray(payload.entries)) setters.setEntries(payload.entries as Entry[]);
  if (Array.isArray(payload.archivedMonths)) setters.setArchivedMonths(payload.archivedMonths as string[]);
  if (payload.archivedData && typeof payload.archivedData === "object") setters.setArchivedData(payload.archivedData as Record<string, Entry[]>);
  if (payload.summaries && typeof payload.summaries === "object") setters.setSummaries(payload.summaries as Record<string, MonthlySummary>);
  if (payload.indicatorSettings && typeof payload.indicatorSettings === "object") setters.setIndicatorSettings(payload.indicatorSettings as Record<string, IndicatorSettings>);
  if (payload.palette && typeof payload.palette === "object") setters.setPalette(smartPalette((payload.palette as Partial<ThemePalette>).primary || defaultPalette.primary));
  if (typeof payload.currentMonth === "string") setters.setCurrentMonth(payload.currentMonth);
  if (typeof payload.alertEmail === "string") setters.setAlertEmail(payload.alertEmail);
  if (typeof payload.selectedPerson === "string") setters.setSelectedPerson(payload.selectedPerson);
  if (typeof payload.reminderEnabled === "boolean") setters.setReminderEnabled(payload.reminderEnabled);
  if (typeof payload.reminderTime === "string") setters.setReminderTime(payload.reminderTime);
  if (typeof payload.boldText === "boolean") setters.setBoldText(payload.boldText);
}

function calendarMonth() { const now = new Date(); return `${monthNames[now.getMonth()]} ${now.getFullYear()}`; }
function nextMonth(label: string) {
  const [month, yearText] = label.split(" ");
  const index = Math.max(0, monthNames.indexOf(month));
  const year = Number(yearText) || new Date().getFullYear();
  return `${monthNames[(index + 1) % 12]} ${index === 11 ? year + 1 : year}`;
}

export default function Home() {
  const [tab, setTab] = useState("PAINEL");
  const [boldText, setBoldText] = useState(false);
  const [people, setPeople] = useState<string[]>(defaultPeople);
  const [origins, setOrigins] = useState<string[]>(defaultOrigins);
  const [expenses, setExpenses] = useState<string[]>(defaultExpenses);
  const [paidExpenses, setPaidExpenses] = useState<Record<string, boolean>>({});
  const [selectedPerson, setSelectedPerson] = useState("");
  const [currentMonth, setCurrentMonth] = useState(calendarMonth);
  const [archivedMonths, setArchivedMonths] = useState<string[]>([]);
  const [archivedData, setArchivedData] = useState<Record<string, Entry[]>>({});
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summaries, setSummaries] = useState<Record<string, MonthlySummary>>({});
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ person: "", origin: "", expense: "", value: "" });
  const [message, setMessage] = useState("");
  const [showNewMonthConfirm, setShowNewMonthConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSalaryEditor, setShowSalaryEditor] = useState(false);
  const [salaryDraft, setSalaryDraft] = useState("");
  const [showSalary, setShowSalary] = useState(false);
  const [indicatorSettings, setIndicatorSettings] = useState<Record<string, IndicatorSettings>>({});
  const [palette, setPalette] = useState<ThemePalette>(defaultPalette);
  const [alertEmail, setAlertEmail] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [accountLabel, setAccountLabel] = useState("usuário");
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudLoadError, setCloudLoadError] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const lastSnapshotRef = useRef<AppSnapshot | null>(null);
  const undoSnapshotRef = useRef<AppSnapshot | null>(null);
  const skipHistoryRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const userIdRef = useRef<string | null>(null);
  const skipNextPersistRef = useRef(false);

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
      const { data, error } = await supabase.from("finance_state").select("payload").eq("user_id", user.id).maybeSingle();
      if (!active) return;
      const localDraftKey = `finance-state-draft:${user.id}`;
      let localDraft: Record<string, unknown> | null = null;
      try { localDraft = JSON.parse(localStorage.getItem(localDraftKey) || "null") as Record<string, unknown> | null; } catch { localDraft = null; }
      const cloudState = data?.payload as Record<string, unknown> | null;
      // O estado online é a fonte principal para contas já existentes.
      // Um rascunho local vazio não pode substituir os dados do Supabase.
      const cloudPayload = (cloudState || localDraft) as Record<string, unknown> | null;
      if (error) {
        console.warn("[Supabase] Não foi possível ler o estado online:", error.message);
        setCloudLoadError("Não foi possível carregar seus dados salvos. Tente atualizar a página.");
        setCloudLoaded(true);
        return;
      } else if (cloudPayload && Object.keys(cloudPayload).length > 0) {
        skipNextPersistRef.current = true;
        applyCloudState(cloudPayload, { setPeople, setOrigins, setExpenses, setPaidExpenses, setEntries, setArchivedMonths, setArchivedData, setSummaries, setIndicatorSettings, setPalette, setCurrentMonth, setAlertEmail, setSelectedPerson, setReminderEnabled, setReminderTime, setBoldText });
        const localBold = localStorage.getItem(`finance-bold:${user.id}`);
        if (localBold !== null) setBoldText(localBold === "true");
      }
      setCloudLoaded(true);
    };
    void loadCloudState();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!cloudLoaded || cloudLoadError) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const payload: AppSnapshot = { boldText, people, origins, expenses, paidExpenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail, selectedPerson, reminderEnabled, reminderTime };
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
    // Grava imediatamente um rascunho individual para proteger alterações feitas antes de um F5.
    localStorage.setItem(localDraftKey, JSON.stringify(payload));
    notify("Salvando alteração...");
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("finance_state").upsert({ id: user.id, user_id: user.id, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) {
        console.warn("[Supabase] Não foi possível salvar o estado online:", error.message);
        notify("Não foi possível salvar esta alteração. Tente novamente.");
        return;
      }
      localStorage.removeItem(localDraftKey);
      legacyStorageKeys.forEach((key) => localStorage.removeItem(key));
      notify("Alteração salva no Supabase.");
    })(), 350);
    return () => { if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current); };
  }, [cloudLoaded, cloudLoadError, boldText, people, origins, expenses, paidExpenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail, selectedPerson, reminderEnabled, reminderTime]);
  const salaryPerson = people[0] || "";
  const isSalaryPerson = Boolean(selectedPerson) && selectedPerson === salaryPerson;
  const summary = useMemo(() => summaries[currentMonth] || emptyMonthlySummary(), [summaries, currentMonth]);
  const selectedEntries = useMemo(() => entries.filter((entry) => entry.person === selectedPerson), [entries, selectedPerson]);
  const selectedExpenses = useMemo(() => selectedEntries.reduce((sum, entry) => sum + entry.value, 0), [selectedEntries]);
  const selectedCard = useMemo(() => selectedEntries.filter((entry) => entry.origin === "CARTÃO").reduce((sum, entry) => sum + entry.value, 0), [selectedEntries]);
  const invoiceTotal = useMemo(() => entries
    .filter((entry) => ["FATURA", "FUTURA"].includes(entry.expense.trim().toLocaleUpperCase("pt-BR")))
    .reduce((sum, entry) => sum + entry.value, 0), [entries]);
  const selectedSalary = isSalaryPerson ? summary.salary : 0;
  const leftover = isSalaryPerson && selectedExpenses > 0 ? selectedSalary - selectedExpenses : 0;
  const selectPerson = (name: string) => {
    setSelectedPerson(name);
    const userId = userIdRef.current;
    if (!userId) return;
    const payload: AppSnapshot = { boldText, people, origins, expenses, paidExpenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail, selectedPerson: name, reminderEnabled, reminderTime };
    const localDraftKey = `finance-state-draft:${userId}`;
    localStorage.setItem(localDraftKey, JSON.stringify(payload));
    void supabase.from("finance_state").upsert({ id: userId, user_id: userId, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).then(({ error }) => {
      if (error) {
        console.warn("[Supabase] Não foi possível salvar a pessoa selecionada:", error.message);
        notify("Não foi possível salvar a pessoa selecionada.");
      } else {
        localStorage.removeItem(localDraftKey);
        notify("Pessoa selecionada salva no Supabase.");
      }
    });
  };

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return selectedEntries;
    return selectedEntries.filter((entry) => `${entry.person} ${entry.origin} ${entry.expense}`.toLocaleLowerCase("pt-BR").includes(q));
  }, [selectedEntries, search]);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
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
    notify(`Lembretes ativados para ${reminderTime}. Salvando...`);
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
    const realMonth = calendarMonth();
    if (currentMonth === realMonth) return;
    if (entries.length > 0) {
      setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
      setArchivedData((current) => current[currentMonth] ? current : ({ ...current, [currentMonth]: entries }));
    }
    setSummaries((current) => ({ ...current, [realMonth]: current[realMonth] || emptyMonthlySummary() }));
    setEntries([]);
    setCurrentMonth(realMonth);
    setTab("PAINEL");
    notify(`Mês atual aberto: ${realMonth}. ${currentMonth} foi arquivado.`);
  }, [cloudLoaded]);

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
            if (!(previous in current)) return current;
            const next = { ...current, [name]: current[previous] };
            delete next[previous];
            return next;
          });
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
  };
  const removeCategory = (kind: "people" | "origins" | "expenses", index: number) => {
    const lists = { people, origins, expenses };
    const removed = lists[kind][index];
    const setters = { people: setPeople, origins: setOrigins, expenses: setExpenses };
    setters[kind]((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (kind === "expenses") setPaidExpenses((current) => { const next = { ...current }; delete next[removed]; return next; });
    if (kind === "people" && selectedPerson === removed) setSelectedPerson(people.find((item) => item !== removed) || "");
  };
  const togglePaidExpense = (expense: string) => setPaidExpenses((current) => ({ ...current, [expense]: !current[expense] }));
  const toggleBoldText = () => setBoldText((current) => {
    const next = !current;
    const userId = userIdRef.current;
    if (userId) localStorage.setItem(`finance-bold:${userId}`, String(next));
    return next;
  });

  const requestNewMonth = () => setShowNewMonthConfirm(true);

  const resetAppState = () => {
    setTab("PAINEL");
    setAccountLabel("usuário");
    setPeople([]);
    setOrigins([]);
    setExpenses([]);
    setPaidExpenses({});
    setSelectedPerson("");
    setCurrentMonth(calendarMonth());
    setArchivedMonths([]);
    setArchivedData({});
    setEntries([]);
    setSummaries({});
    setSearch("");
    setForm({ person: "", origin: "", expense: "", value: "" });
    setShowNewMonthConfirm(false);
    setShowSettings(false);
    setShowSalaryEditor(false);
    setSalaryDraft("");
    setShowSalary(false);
    setIndicatorSettings({});
    setReminderEnabled(false);
    setReminderTime("20:00");
    setPalette(defaultPalette);
    setBoldText(false);
    setCanUndo(false);
    lastSnapshotRef.current = null;
    undoSnapshotRef.current = null;
  };
  const handleSignOut = async () => {
    const userId = userIdRef.current;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    if (userId) {
      const payload: AppSnapshot = { boldText, people, origins, expenses, paidExpenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail, selectedPerson, reminderEnabled, reminderTime };
      const localDraftKey = `finance-state-draft:${userId}`;
      localStorage.setItem(localDraftKey, JSON.stringify(payload));
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === userId) {
        const { error } = await supabase.from("finance_state").upsert({ id: userId, user_id: userId, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        if (!error) localStorage.removeItem(localDraftKey);
        else {
          console.warn("[Supabase] Não foi possível salvar antes do logout:", error.message);
          notify("Não foi possível salvar seus dados. Você continua conectado para tentar novamente.");
          return;
        }
      }
    }
    await supabase.auth.signOut();
    resetAppState();
    userIdRef.current = null;
    setCloudLoaded(false);
  };
  const settingsForPerson: IndicatorSettings = indicatorSettings[selectedPerson] || (isSalaryPerson
    ? { salary: true, expenses: true, leftover: true, card: true }
    : { salary: false, expenses: true, leftover: false, card: true });
  const updateIndicator = (key: IndicatorKey, visible: boolean) => setIndicatorSettings((current) => ({ ...current, [selectedPerson]: { ...(current[selectedPerson] || settingsForPerson), [key]: visible } }));
  const configurableIndicators: [IndicatorKey, string][] = isSalaryPerson ? [["salary", "Salário"], ["expenses", "Despesas"], ["leftover", "Sobrou"], ["card", "Gastos com cartão"]] : [["expenses", "Despesas"], ["card", "Gastos com cartão"]];
  const goToCurrentMonth = () => {
    const realMonth = calendarMonth();
    if (currentMonth === realMonth) { setTab("PAINEL"); notify(`Você já está no mês atual: ${realMonth}.`); return; }
    if (entries.length > 0) {
      setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
      setArchivedData((current) => ({ ...current, [currentMonth]: entries }));
    }
    setEntries([]);
    setSummaries((current) => ({ ...current, [realMonth]: current[realMonth] || emptyMonthlySummary() }));
    setCurrentMonth(realMonth);
    setTab("PAINEL");
    notify(`${currentMonth} arquivado. Mês atual aberto: ${realMonth}.`);
  };
  const switchMonth = (targetMonth: string) => {
    if (!targetMonth || targetMonth === currentMonth) return;
    setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
    setArchivedData((current) => ({ ...current, [currentMonth]: entries }));
    setEntries(archivedData[targetMonth] || []);
    setCurrentMonth(targetMonth);
    setSearch("");
    setForm({ person: "", origin: "", expense: "", value: "" });
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
    return { ...current, [month]: { ...previous, expenses: rows.reduce((sum, entry) => sum + entry.value, 0), card: rows.filter((entry) => entry.origin === "CARTÃO").reduce((sum, entry) => sum + entry.value, 0) } };
  };
  const editEntry = (month: string, updated: Entry) => {
    if (month === currentMonth) {
      setEntries((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSummaries((current) => recalculateMonth(month, entries.map((entry) => entry.id === updated.id ? updated : entry), current));
    } else {
      setArchivedData((current) => ({ ...current, [month]: (current[month] || []).map((entry) => entry.id === updated.id ? updated : entry) }));
      setSummaries((current) => recalculateMonth(month, (archivedData[month] || []).map((entry) => entry.id === updated.id ? updated : entry), current));
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
    if (!form.person || !form.origin || !form.expense || !value) {
      notify("Preencha pessoa, origem, despesa e valor.");
      return;
    }
    setEntries((current) => [{ id: Date.now(), person: form.person, origin: form.origin, expense: form.expense, value }, ...current]);
    setSummaries((current) => { const previous = current[currentMonth] || emptyMonthlySummary(); return { ...current, [currentMonth]: { ...previous, expenses: previous.expenses + value, card: previous.card + (form.origin === "CARTÃO" ? value : 0) } }; });
    setForm({ person: "", origin: "", expense: "", value: "" });
    notify("Registro adicionado. Salvando...");
    setTab("HISTÓRICO");
  };

  const dangerMode = isSalaryPerson && leftover <= 0;
  const activePalette = dangerMode ? dangerPalette : palette;
  const gradientAccent = dangerMode
    ? dangerPalette.card
    : isSalaryPerson && leftover > 0 ? palette.card
    : selectedExpenses > 0 ? palette.card : palette.background;

  if (!cloudLoaded) return <div className="auth-loading">Carregando seus dados salvos...</div>;
  if (cloudLoadError) return <div className="auth-loading">{cloudLoadError}</div>;
  return (
    <div className={`sheet-app ${boldText ? "strong-mode" : ""}`} style={{ "--theme-primary": activePalette.primary, "--theme-background": activePalette.background, "--theme-card": activePalette.card, "--theme-text": activePalette.text, "--theme-gradient-accent": gradientAccent } as React.CSSProperties}>
      <header className="sheet-topbar"><button className="sheet-brand account-button" type="button" ><span className="sheet-logo">+</span><span><strong>Conta de {accountLabel}</strong><small>{currentMonth}</small></span></button><div className="top-actions"><button type="button" className={`bold-toggle ${boldText ? "active" : ""}`} onClick={toggleBoldText} aria-label="Alternar texto em negrito" title="Alternar negrito"><Bold size={15} /></button><button className="new-month-button" type="button" onClick={(event) => { event.preventDefault(); requestNewMonth(); }}>Novo mês</button><button className="undo-button" type="button" onClick={(event) => { event.preventDefault(); undoLastAction(); }} disabled={!canUndo} aria-label="Desfazer última ação" title="Desfazer última ação (Ctrl+Z)"><Undo2 size={16} /></button><button className="top-icon" type="button" onClick={(event) => { event.preventDefault(); setShowSettings(true); }} aria-label="Configurações"><Settings2 size={18} /></button><button className="top-icon sign-out-button" type="button" onClick={() => { void handleSignOut(); }} aria-label="Sair da conta" title="Sair"><LogOut size={18} /></button></div></header>
      <main className="sheet-main">
        <nav className="sheet-tabs" aria-label="Seções da planilha">{[["PAINEL", HomeIcon], ["REGISTRO", ClipboardList], ["HISTÓRICO", History], ["CATEGORIAS", BarChart3], ["LISTA", ClipboardList]].map(([name, Icon]) => <button key={name as string} className={tab === name ? "selected" : ""} type="button" onClick={(event) => { event.preventDefault(); setTab(name as string); }}><Icon size={16} /><span>{name as string}</span></button>)}</nav>
        {message && <div className="sheet-message" role="status">{message}</div>}
      {tab === "PAINEL" && <Dashboard people={people} settings={settingsForPerson} month={currentMonth} archivedMonths={archivedMonths} salary={selectedSalary} showSalary={showSalary} onToggleSalary={() => setShowSalary((current) => !current)} expenses={selectedExpenses} leftover={leftover} card={selectedCard} invoiceTotal={invoiceTotal} isAccountHolder={isSalaryPerson} selectedPerson={selectedPerson} onPersonChange={selectPerson} onRegister={() => setTab("REGISTRO")} onHistory={() => setTab("HISTÓRICO")} onCurrentMonth={goToCurrentMonth} onEditSalary={openSalaryEditor} />}
        {tab === "REGISTRO" && <Register form={form} setForm={setForm} onSubmit={register} people={people} origins={origins} expenses={expenses} />}
        {tab === "HISTÓRICO" && <HistoryView entries={filteredEntries} allEntries={selectedEntries} search={search} setSearch={setSearch} month={currentMonth} archivedMonths={archivedMonths} archivedData={archivedData} summaries={summaries} person={selectedPerson} onEdit={editEntry} onDelete={deleteEntry} onMonthChange={switchMonth} />}
        {tab === "CATEGORIAS" && <CategoriesView people={people} origins={origins} expenses={expenses} onRename={updateCategory} onAdd={addCategory} onRemove={removeCategory} />}
        {tab === "LISTA" && <ExpenseListView expenses={expenses} paidExpenses={paidExpenses} onTogglePaid={togglePaidExpense} />}
      </main>
      {showSalaryEditor && <div className="salary-editor-backdrop" role="presentation" onClick={() => setShowSalaryEditor(false)}><div className="salary-editor-modal" role="dialog" aria-modal="true" aria-labelledby="salary-editor-title" onClick={(event) => event.stopPropagation()}><span className="modal-kicker">EDITAR SALÁRIO</span><h2 id="salary-editor-title">Salário de {currentMonth}</h2><p>Altere o valor deste mês. O salário ficará salvo no histórico mensal do Supabase.</p><label className="field-label">VALOR DO SALÁRIO<input className="sheet-input" inputMode="decimal" autoFocus value={salaryDraft} onChange={(event) => setSalaryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveSalary(); }} /></label><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => setShowSalaryEditor(false)}>Cancelar</button><button type="button" className="modal-confirm" onClick={saveSalary}>Salvar salário</button></div></div></div>}
      {showSettings && <div className="settings-backdrop" role="presentation" onClick={() => setShowSettings(false)}><div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><div className="settings-heading"><div><span className="modal-kicker">CONFIGURAÇÕES</span><h2 id="settings-title">Indicadores de {selectedPerson}</h2></div><button type="button" className="settings-close" onClick={() => setShowSettings(false)} aria-label="Fechar configurações"><X size={18} /></button></div><p>Usuário logado possui salário e sobra. Os demais perfis mostram apenas despesas e cartão.</p><div className="settings-list">{configurableIndicators.map(([key, label]) => <label className="settings-row" key={key}><span>{label}</span><input type="checkbox" checked={settingsForPerson[key]} onChange={(event) => updateIndicator(key, event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>)}</div><div className="palette-section"><span className="palette-title">PALETA DE CORES</span><p>Personalize o visual do sistema. As cores ficam salvas no Supabase.</p><div className="palette-preview" aria-label="Prévia do tema inteligente"><span style={{ background: palette.primary }} /><span style={{ background: palette.card }} /><span style={{ background: palette.background }} /><span style={{ background: palette.text }} /></div><p className="smart-palette-note">Uma única cor principal. O sistema combina automaticamente o fundo, os cartões e os textos para manter o contraste e a harmonia.</p><div className="palette-grid"><PalettePicker label="Cor principal do sistema" value={palette.primary} onChange={(value) => setPalette(smartPalette(value))} /></div><button type="button" className="palette-reset" onClick={() => setPalette(defaultPalette)}>Restaurar cores originais</button></div><button type="button" className="settings-done" onClick={closeSettings}>Concluir</button></div></div>}
      {showNewMonthConfirm && <div className="month-modal-backdrop" role="presentation"><div className="month-modal" role="dialog" aria-modal="true" aria-labelledby="new-month-title"><span className="modal-kicker">ARQUIVAR MÊS</span><h2 id="new-month-title">Começar um novo mês?</h2><p>Os lançamentos de <strong>{currentMonth}</strong> serão salvos no histórico e a tela ficará pronta para {nextMonth(currentMonth)}.</p><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => setShowNewMonthConfirm(false)}>Cancelar</button><button type="button" className="modal-confirm" onClick={() => { setShowNewMonthConfirm(false); startNewMonth(); }}>Começar novo mês</button></div></div></div>}
    </div>
  );
}

function Dashboard({ people, settings, month, archivedMonths, salary, showSalary, onToggleSalary, expenses, leftover, card, invoiceTotal, isAccountHolder, selectedPerson, onPersonChange, onRegister, onHistory, onCurrentMonth, onEditSalary }: { people: string[]; settings: IndicatorSettings; month: string; archivedMonths: string[]; salary: number; showSalary: boolean; onToggleSalary: () => void; expenses: number; leftover: number; card: number; invoiceTotal: number; isAccountHolder: boolean; selectedPerson: string; onPersonChange: (name: string) => void; onRegister: () => void; onHistory: () => void; onCurrentMonth: () => void; onEditSalary: () => void }) {
  const face = expenses === 0 ? "😐" : leftover > 0 ? "🙂" : "😟";
  const faceLabel = expenses === 0 ? "Ainda sem lançamentos" : leftover > 0 ? "Saldo positivo" : "Atenção aos gastos";
  return (
    <section className="panel-view">
      <button type="button" className="month-chip" onClick={onCurrentMonth} aria-label="Abrir mês atual">MÊS ATUAL <strong>{month}</strong></button>
      <div className={`welcome-strip ${!settings.salary ? "without-salary" : ""} ${leftover < 0 ? "negative-balance" : ""}`}>
        <div className="welcome-copy"><span>Bem vindo,</span><select className="person-switcher" value={selectedPerson} onChange={(event) => onPersonChange(event.target.value)} aria-label="Selecionar nome"><option value="" disabled>{people.length ? "Selecione uma pessoa" : "Adicione uma pessoa em Categorias"}</option>{people.map((person) => <option key={person} value={person}>{person}</option>)}</select><ChevronDown size={15} /></div>
        {settings.salary && <Metric label="Salário" value={salary} visible={showSalary} onToggleVisibility={onToggleSalary} editable onClick={onEditSalary} />}
        {settings.expenses && <Metric label="Despesas" value={expenses} />}
        {settings.leftover && <Metric label="Sobrou" value={leftover} />}
        {settings.card && <Metric label="Gastos com cartão" value={card} />}
        {settings.card && isAccountHolder && <Metric label="Valor total da fatura" value={invoiceTotal} />}
      </div>
      <div className="dashboard-actions"><button type="button" onClick={(event) => { event.preventDefault(); onRegister(); }} className={`green-action ${leftover < 0 ? "danger-action" : ""}`}><CirclePlus size={19} /> Registrar despesa</button><button type="button" onClick={(event) => { event.preventDefault(); onHistory(); }} className="light-action"><History size={18} /> Ver histórico</button></div>
      <div className="balance-face" aria-label={`Status financeiro: ${faceLabel}`}><span aria-hidden="true">{face}</span><small>{faceLabel}</small></div>
    </section>
  );
}

function Metric({ label, value, visible = true, onToggleVisibility, editable, onClick }: { label: string; value: number; visible?: boolean; onToggleVisibility?: () => void; editable?: boolean; onClick?: () => void }) {
  const content = <><span>{label}{editable && <small className="metric-edit-hint"> editar</small>}{onToggleVisibility && <button type="button" className="salary-visibility-button" onClick={(event) => { event.stopPropagation(); onToggleVisibility(); }} aria-label={visible ? "Ocultar salário" : "Mostrar salário"} title={visible ? "Ocultar salário" : "Mostrar salário"}>{visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>}</span><strong>{visible ? brl.format(value) : "R$ •••••"}</strong></>;
  return editable ? <div className="metric metric-editable" onClick={onClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onClick?.(); }} role="button" tabIndex={0} aria-label={`Editar ${label}`}>{content}</div> : <div className="metric">{content}</div>;
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
function Register({ form, setForm, onSubmit, people, origins, expenses }: { people: string[]; origins: string[]; expenses: string[]; form: { person: string; origin: string; expense: string; value: string }; setForm: React.Dispatch<React.SetStateAction<{ person: string; origin: string; expense: string; value: string }>>; onSubmit: (event: FormEvent) => void }) {
  const choose = (field: "person" | "origin" | "expense", value: string) => setForm((current) => ({ ...current, [field]: value }));
  return <section className="register-view"><div className="section-title"><span>REGISTRO</span><h1>Adicionar despesa</h1><p>Abra cada seletor para escolher pessoa, origem e despesa.</p></div><form className="register-card" onSubmit={onSubmit}><Field label="PESSOA"><Select value={form.person} placeholder="Selecione uma pessoa" options={people} onChange={(value) => choose("person", value)} /></Field><Field label="ORIGEM"><Select value={form.origin} placeholder="Selecione a origem" options={origins} onChange={(value) => choose("origin", value)} /></Field><Field label="DESPESA"><Select value={form.expense} placeholder="Selecione uma despesa" options={expenses} onChange={(value) => choose("expense", value)} /></Field><label className="field-label">VALOR<input className="sheet-input" inputMode="decimal" placeholder="R$ 0,00" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></label><button className="register-button" type="submit">REGISTRAR</button></form></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field-label">{label}{children}</label>; }
function Select({ value, placeholder, options, onChange }: { value: string; placeholder: string; options: string[]; onChange: (value: string) => void }) { return <div className="select-wrap"><select className="sheet-input" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={15} /></div>; }
function QuickChoices({ options, value, onChoose }: { options: string[]; value: string; onChoose: (value: string) => void }) { return options.length > 0 ? <div className="quick-choices" aria-label="Itens usados recentemente">{options.slice(0, 8).map((option) => <button type="button" className={option === value ? "selected" : ""} key={option} onClick={() => onChoose(option)}>{option}</button>)}</div> : <small className="quick-choices-empty">Adicione itens em Categorias</small>; }

function HistoryView({ entries, allEntries, search, setSearch, month, archivedMonths, archivedData, summaries, person, onEdit, onDelete, onMonthChange }: { entries: Entry[]; allEntries: Entry[]; search: string; setSearch: (value: string) => void; month: string; archivedMonths: string[]; archivedData: Record<string, Entry[]>; summaries: Record<string, MonthlySummary>; person: string; onEdit: (month: string, entry: Entry) => void; onDelete: (month: string, id: number) => void; onMonthChange: (month: string) => void }) {
  const [exportMonth, setExportMonth] = useState(month);
  const [exportMessage, setExportMessage] = useState("");
  const [editing, setEditing] = useState<{ month: string; entry: Entry } | null>(null);
  const [draft, setDraft] = useState<Entry | null>(null);
  const startEdit = (archiveMonth: string, entry: Entry) => { setEditing({ month: archiveMonth, entry }); setDraft({ ...entry }); };
  const saveEdit = () => { if (editing && draft && draft.person.trim() && draft.origin.trim() && draft.expense.trim() && draft.value > 0) { onEdit(editing.month, { ...draft, person: draft.person.trim(), origin: draft.origin.trim(), expense: draft.expense.trim() }); setEditing(null); setDraft(null); } };
  const rows = (items: Entry[], rowMonth: string) => items.map((entry) => <div className="table-row history-row" key={`${rowMonth}-${entry.id}`}><span>{entry.person}</span><span>{entry.origin}</span><span>{entry.expense}</span><strong>{brl.format(entry.value)}</strong><div className="row-actions"><button type="button" onClick={() => startEdit(rowMonth, entry)} aria-label="Editar lançamento"><Pencil size={14} /></button><button type="button" onClick={() => onDelete(rowMonth, entry.id)} aria-label="Apagar lançamento"><Trash2 size={14} /></button></div></div>);
  const savedMonths = archivedMonths.filter((savedMonth) => savedMonth !== month && Object.prototype.hasOwnProperty.call(archivedData, savedMonth));
  const monthOptions = [month, ...savedMonths];
  useEffect(() => {
    if (!monthOptions.includes(exportMonth)) setExportMonth(month);
  }, [month, exportMonth, savedMonths.join("|")]);
  const exportEntries = exportMonth === month ? allEntries : (archivedData[exportMonth] || []);
  const exportSpreadsheet = () => {
    const csvRows = [["MÊS", exportMonth], [], ["PESSOA", "ORIGEM", "DESPESA", "VALOR"], ...exportEntries.map((entry) => [entry.person, entry.origin, entry.expense, entry.value.toFixed(2).replace(".", ",")]), [], ["TOTAL", "", "", (summaries[exportMonth]?.expenses ?? exportEntries.reduce((sum, entry) => sum + entry.value, 0)).toFixed(2).replace(".", ",")]];
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
  return <section className="history-view"><div className="section-title"><span>HISTÓRICO</span><h1>Lançamentos registrados</h1><p>Registros de {month} para {person}. Escolha um mês para abrir todo o sistema nesse período.</p></div><div className="history-month-picker"><label className="field-label">VISUALIZAR MÊS<select className="export-month-select" value={month} onChange={(event) => onMonthChange(event.target.value)} aria-label="Abrir outro mês">{monthOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div><div className="export-panel"><div><span>EXPORTAR PLANILHA</span><strong>Escolha o mês desejado</strong></div><div className="export-controls"><select className="export-month-select" value={exportMonth} onChange={(event) => setExportMonth(event.target.value)} aria-label="Mês para exportar">{monthOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><button type="button" className="export-button" onClick={exportSpreadsheet}><Download size={16} /> Exportar</button></div></div>{exportMessage && <div className="export-message" role="status">{exportMessage}</div>}<div className="history-toolbar"><div className="sheet-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar pessoa, origem ou despesa" />{search && <button type="button" onClick={(event) => { event.preventDefault(); setSearch(""); }} aria-label="Limpar pesquisa"><X size={15} /></button>}</div></div><div className="history-table"><div className="table-head"><span>PESSOA</span><span>ORIGEM</span><span>DESPESA</span><span>VALOR</span><span>AÇÃO</span></div>{rows(entries, month)}{entries.length === 0 && <div className="no-results">Nenhum registro registrado em {month}.</div>}</div>{editing && draft && <div className="edit-entry-backdrop" role="presentation"><div className="edit-entry-modal" role="dialog" aria-modal="true"><span className="modal-kicker">EDITAR LANÇAMENTO</span><h2>{editing.month}</h2><input value={draft.person} onChange={(event) => setDraft({ ...draft, person: event.target.value })} aria-label="Pessoa" /><input value={draft.origin} onChange={(event) => setDraft({ ...draft, origin: event.target.value })} aria-label="Origem" /><input value={draft.expense} onChange={(event) => setDraft({ ...draft, expense: event.target.value })} aria-label="Despesa" /><input inputMode="decimal" value={String(draft.value).replace(".", ",")} onChange={(event) => setDraft({ ...draft, value: parseAmount(event.target.value) || 0 })} aria-label="Valor" /><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</button><button type="button" className="modal-confirm" onClick={saveEdit}>Salvar</button></div></div></div>}</section>;
}

function CategoriesView({ people, origins, expenses, onRename, onAdd, onRemove }: { people: string[]; origins: string[]; expenses: string[]; onRename: (kind: "people" | "origins" | "expenses", index: number, name: string) => void; onAdd: (kind: "people" | "origins" | "expenses", name: string) => void; onRemove: (kind: "people" | "origins" | "expenses", index: number) => void }) {
  return <section className="categories-view"><div className="section-title"><span>CATEGORIAS</span><h1>Listas editáveis</h1><p>Altere qualquer nome; a mudança é salva e atualiza os registros do sistema.</p></div><div className="category-columns"><Category title="PESSOAS" kind="people" items={people} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /><Category title="ORIGEM" kind="origins" items={origins} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /><Category title="DESPESAS" kind="expenses" items={expenses} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /></div></section>;
}

function ExpenseListView({ expenses, paidExpenses, onTogglePaid }: { expenses: string[]; paidExpenses: Record<string, boolean>; onTogglePaid: (expense: string) => void }) {
  return <section className="categories-view"><div className="section-title"><span>LISTA DESPESAS</span><h1>Controle de despesas</h1><p>Marque quais despesas já foram pagas. Isso não altera os lançamentos.</p></div><div className="paid-expenses-list"><div className="paid-expenses-heading"><span>DESPESAS CADASTRADAS</span><p>Os nomes vêm da aba Categorias.</p></div>{expenses.length === 0 ? <small className="quick-choices-empty">Adicione despesas na aba Categorias.</small> : expenses.map((expense) => <label className={`paid-expense-row ${paidExpenses[expense] ? "is-paid" : ""}`} key={expense}><input type="checkbox" checked={Boolean(paidExpenses[expense])} onChange={() => onTogglePaid(expense)} aria-label={`${paidExpenses[expense] ? "Desmarcar" : "Marcar"} ${expense} como já pago`} /><span className="paid-expense-action">{paidExpenses[expense] ? "Já foi pago" : "Marcar como pago"}</span><span className="paid-expense-name">{expense}</span></label>)}</div></section>;
}
function Category({ title, kind, items, onRename, onAdd, onRemove }: { title: string; kind: "people" | "origins" | "expenses"; items: string[]; onRename: (kind: "people" | "origins" | "expenses", index: number, name: string) => void; onAdd: (kind: "people" | "origins" | "expenses", name: string) => void; onRemove: (kind: "people" | "origins" | "expenses", index: number) => void }) {
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const finishRename = (index: number) => {
    const draft = drafts[index];
    if (draft === undefined) return;
    const name = draft.trim();
    if (name && name !== items[index]) onRename(kind, index, name);
    setDrafts((current) => { const next = { ...current }; delete next[index]; return next; });
  };
  return <div className="category-card"><h2>{title}</h2>{items.map((item, index) => <div className="category-edit-row" key={`${kind}-${index}`}><input value={drafts[index] ?? item} onChange={(event) => setDrafts((current) => ({ ...current, [index]: event.target.value }))} onBlur={() => finishRename(index)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} aria-label={`Editar ${title.toLocaleLowerCase()} ${index + 1}`} /><button type="button" onClick={() => onRemove(kind, index)} aria-label={`Excluir ${item}`}>×</button></div>)}<form className="category-add" onSubmit={(event) => { event.preventDefault(); onAdd(kind, newName); setNewName(""); }}><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Adicionar novo" /><button type="submit">Adicionar</button></form></div>;
}
