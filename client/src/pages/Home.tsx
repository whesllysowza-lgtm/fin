import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, ChevronDown, CirclePlus, ClipboardList, History, Home as HomeIcon, Plus, Search, Settings2, Download, X, Pencil, Trash2, Undo2, LineChart, CalendarDays } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Entry = { id: number; person: string; origin: string; expense: string; value: number };
type MonthlySummary = { salary: number; expenses: number; card: number };
type IndicatorKey = "salary" | "expenses" | "leftover" | "card";
type IndicatorSettings = Record<IndicatorKey, boolean>;
type ThemePalette = { primary: string; background: string; card: string; text: string };

const defaultPalette: ThemePalette = { primary: "#2e6f25", background: "#f5f8f3", card: "#e4f5df", text: "#2f3c2d" };
type AppSnapshot = { people: string[]; origins: string[]; expenses: string[]; entries: Entry[]; archivedMonths: string[]; archivedData: Record<string, Entry[]>; summaries: Record<string, MonthlySummary>; indicatorSettings: Record<string, IndicatorSettings>; palette: ThemePalette; currentMonth: string; alertEmail: string };

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

const defaultPeople = ["Wesly", "Pai", "Mãe", "Vanessa", "Cristiano", "Vô"];
const defaultOrigins = ["CARTÃO", "DESPESAS SIMPLES"];
const defaultExpenses = ["CASA ok", "ÁGUA ok", "INTERNET", "PAI", "RÉMEDIO", "RÉMEDIO DA PRESSÃO", "MOTO", "ACADEMIA", "FATURA"];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const legacyStorageKeys = ["wesly-people", "wesly-origins", "wesly-expenses", "wesly-current-month", "wesly-archived-months", "wesly-archived-data", "wesly-current-entries", "wesly-monthly-summaries", "wesly-indicator-settings"];

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
  setEntries: (value: Entry[]) => void;
  setArchivedMonths: (value: string[]) => void;
  setArchivedData: (value: Record<string, Entry[]>) => void;
  setSummaries: (value: Record<string, MonthlySummary>) => void;
  setIndicatorSettings: (value: Record<string, IndicatorSettings>) => void;
  setPalette: (value: ThemePalette) => void;
  setCurrentMonth: (value: string) => void;
  setAlertEmail: (value: string) => void;
}) {
  if (!payload) return;
  if (Array.isArray(payload.people)) setters.setPeople(payload.people as string[]);
  if (Array.isArray(payload.origins)) setters.setOrigins(payload.origins as string[]);
  if (Array.isArray(payload.expenses)) setters.setExpenses(payload.expenses as string[]);
  if (Array.isArray(payload.entries)) setters.setEntries(payload.entries as Entry[]);
  if (Array.isArray(payload.archivedMonths)) setters.setArchivedMonths(payload.archivedMonths as string[]);
  if (payload.archivedData && typeof payload.archivedData === "object") setters.setArchivedData(payload.archivedData as Record<string, Entry[]>);
  if (payload.summaries && typeof payload.summaries === "object") setters.setSummaries(payload.summaries as Record<string, MonthlySummary>);
  if (payload.indicatorSettings && typeof payload.indicatorSettings === "object") setters.setIndicatorSettings(payload.indicatorSettings as Record<string, IndicatorSettings>);
  if (payload.palette && typeof payload.palette === "object") setters.setPalette({ ...defaultPalette, ...(payload.palette as Partial<ThemePalette>) });
  if (typeof payload.currentMonth === "string") setters.setCurrentMonth(payload.currentMonth);
  if (typeof payload.alertEmail === "string") setters.setAlertEmail(payload.alertEmail);
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
  const [people, setPeople] = useState<string[]>(() => JSON.parse(localStorage.getItem("wesly-people") || "null") || defaultPeople);
  const [origins, setOrigins] = useState<string[]>(() => JSON.parse(localStorage.getItem("wesly-origins") || "null") || defaultOrigins);
  const [expenses, setExpenses] = useState<string[]>(() => JSON.parse(localStorage.getItem("wesly-expenses") || "null") || defaultExpenses);
  const [selectedPerson, setSelectedPerson] = useState("Wesly");
  const [currentMonth, setCurrentMonth] = useState(() => localStorage.getItem("wesly-current-month") || calendarMonth());
  const [archivedMonths, setArchivedMonths] = useState<string[]>(() => JSON.parse(localStorage.getItem("wesly-archived-months") || "[]"));
  const [archivedData, setArchivedData] = useState<Record<string, Entry[]>>(() => JSON.parse(localStorage.getItem("wesly-archived-data") || "{}"));
  const [entries, setEntries] = useState<Entry[]>(() => JSON.parse(localStorage.getItem("wesly-current-entries") || "null") || initialEntries);
  const [summaries, setSummaries] = useState<Record<string, MonthlySummary>>(() => JSON.parse(localStorage.getItem("wesly-monthly-summaries") || "null") || { "Junho 2026": { salary: 1540, expenses: 982.65, card: 229.65 } });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ person: "", origin: "", expense: "", value: "" });
  const [message, setMessage] = useState("");
  const [showNewMonthConfirm, setShowNewMonthConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSalaryEditor, setShowSalaryEditor] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showYearOverview, setShowYearOverview] = useState(false);
  const [salaryDraft, setSalaryDraft] = useState("");
  const [indicatorSettings, setIndicatorSettings] = useState<Record<string, IndicatorSettings>>(() => JSON.parse(localStorage.getItem("wesly-indicator-settings") || "null") || { Wesly: { salary: true, expenses: true, leftover: true, card: true }, Pai: { salary: false, expenses: true, leftover: true, card: true }, Mãe: { salary: false, expenses: true, leftover: true, card: true }, Vanessa: { salary: false, expenses: true, leftover: true, card: true }, Cristiano: { salary: false, expenses: true, leftover: true, card: true }, Vô: { salary: false, expenses: true, leftover: true, card: true } });
  const [palette, setPalette] = useState<ThemePalette>(defaultPalette);
  const [alertEmail, setAlertEmail] = useState("wesleyflamengo23@hotmail.com");
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const lastSnapshotRef = useRef<AppSnapshot | null>(null);
  const undoSnapshotRef = useRef<AppSnapshot | null>(null);
  const skipHistoryRef = useRef(false);

  useEffect(() => {
    let active = true;
    const loadCloudState = async () => {
      const { data, error } = await supabase.from("finance_state").select("payload").eq("id", "main").maybeSingle();
      if (!active) return;
      const cloudPayload = data?.payload as Record<string, unknown> | null;
      const legacyPayload = readLegacyState();
      if (error) {
        console.warn("[Supabase] Não foi possível ler o estado online:", error.message);
      } else if (cloudPayload && Object.keys(cloudPayload).length > 0) {
        applyCloudState(cloudPayload, { setPeople, setOrigins, setExpenses, setEntries, setArchivedMonths, setArchivedData, setSummaries, setIndicatorSettings, setPalette, setCurrentMonth, setAlertEmail });
      } else if (legacyPayload) {
        applyCloudState(legacyPayload, { setPeople, setOrigins, setExpenses, setEntries, setArchivedMonths, setArchivedData, setSummaries, setIndicatorSettings, setPalette, setCurrentMonth, setAlertEmail });
      }
      setCloudLoaded(true);
    };
    void loadCloudState();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!cloudLoaded) return;
    const payload: AppSnapshot = { people, origins, expenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth, alertEmail };
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      undoSnapshotRef.current = null;
      setCanUndo(false);
    } else if (lastSnapshotRef.current) {
      undoSnapshotRef.current = lastSnapshotRef.current;
      setCanUndo(true);
    }
    lastSnapshotRef.current = payload;
    void supabase.from("finance_state").upsert({ id: "main", payload, updated_at: new Date().toISOString() }).then(({ error }) => {
      if (error) {
        console.warn("[Supabase] Não foi possível salvar o estado online:", error.message);
        return;
      }
      legacyStorageKeys.forEach((key) => localStorage.removeItem(key));
    });
  }, [cloudLoaded, people, origins, expenses, entries, archivedMonths, archivedData, summaries, indicatorSettings, palette, currentMonth]);
  const summary = summaries[currentMonth] || { salary: 1540, expenses: 0, card: 0 };
  const selectedEntries = useMemo(() => entries.filter((entry) => entry.person === selectedPerson), [entries, selectedPerson]);
  const selectedExpenses = selectedEntries.reduce((sum, entry) => sum + entry.value, 0);
  const selectedCard = selectedEntries.filter((entry) => entry.origin === "CARTÃO").reduce((sum, entry) => sum + entry.value, 0);
  const selectedSalary = selectedPerson === "Wesly" ? summary.salary : 0;
  const leftover = selectedPerson === "Wesly" ? selectedSalary - selectedExpenses : 0;

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
    setEntries(snapshot.entries);
    setArchivedMonths(snapshot.archivedMonths);
    setArchivedData(snapshot.archivedData);
    setSummaries(snapshot.summaries);
    setIndicatorSettings(snapshot.indicatorSettings);
    setPalette(snapshot.palette);
    setCurrentMonth(snapshot.currentMonth);
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
    if (selectedPerson !== "Wesly") return;
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
    const salary = Number(salaryDraft.replace(/[^0-9,.-]/g, "").replace(",", "."));
    if (!Number.isFinite(salary) || salary < 0) {
      notify("Informe um salário válido.");
      return;
    }
    setSummaries((current) => ({
      ...current,
      [currentMonth]: { ...(current[currentMonth] || { salary: 0, expenses: 0, card: 0 }), salary },
    }));
    setShowSalaryEditor(false);
    notify(`Salário de ${currentMonth} atualizado.`);
    if (salary <= 0) void sendSalaryAlert(salary, currentMonth);
  };

  useEffect(() => {
    const realMonth = calendarMonth();
    if (currentMonth === realMonth) return;
    if (entries.length > 0) {
      setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
      setArchivedData((current) => current[currentMonth] ? current : ({ ...current, [currentMonth]: entries }));
    }
    setSummaries((current) => ({ ...current, [realMonth]: current[realMonth] || { salary: 1540, expenses: 0, card: 0 } }));
    setEntries([]);
    setCurrentMonth(realMonth);
    setTab("PAINEL");
    notify(`Mês atual aberto: ${realMonth}. ${currentMonth} foi arquivado.`);
  }, []);

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
    if (!lists[kind].some((item) => item.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR"))) setters[kind]((current) => [...current, value]);
  };
  const removeCategory = (kind: "people" | "origins" | "expenses", index: number) => {
    const lists = { people, origins, expenses };
    if (lists[kind].length <= 1) return;
    const removed = lists[kind][index];
    const setters = { people: setPeople, origins: setOrigins, expenses: setExpenses };
    setters[kind]((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (kind === "people" && selectedPerson === removed) setSelectedPerson(people.find((item) => item !== removed) || "Wesly");
  };

  const requestNewMonth = () => setShowNewMonthConfirm(true);

  const openAccount = () => setShowYearOverview(true);
  const settingsForPerson: IndicatorSettings = selectedPerson === "Wesly"
    ? { salary: true, expenses: true, leftover: true, card: true }
    : { salary: false, expenses: true, leftover: false, card: true };
  const updateIndicator = (key: IndicatorKey, visible: boolean) => setIndicatorSettings((current) => ({ ...current, [selectedPerson]: { ...(current[selectedPerson] || settingsForPerson), [key]: visible } }));
  const configurableIndicators: [IndicatorKey, string][] = selectedPerson === "Wesly" ? [["salary", "Salário"], ["expenses", "Despesas"], ["leftover", "Sobrou"], ["card", "Gastos com cartão"]] : [["expenses", "Despesas"], ["card", "Gastos com cartão"]];
  const goToCurrentMonth = () => {
    const realMonth = calendarMonth();
    if (currentMonth === realMonth) { setTab("PAINEL"); notify(`Você já está no mês atual: ${realMonth}.`); return; }
    if (entries.length > 0) {
      setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
      setArchivedData((current) => ({ ...current, [currentMonth]: entries }));
    }
    setEntries([]);
    setSummaries((current) => ({ ...current, [realMonth]: current[realMonth] || { salary: 1540, expenses: 0, card: 0 } }));
    setCurrentMonth(realMonth);
    setTab("PAINEL");
    notify(`${currentMonth} arquivado. Mês atual aberto: ${realMonth}.`);
  };

  const startNewMonth = () => {
    const next = nextMonth(currentMonth);
    setArchivedMonths((current) => current.includes(currentMonth) ? current : [currentMonth, ...current]);
    setArchivedData((current) => ({ ...current, [currentMonth]: entries }));
    setEntries([]);
    setSummaries((current) => ({ ...current, [next]: current[next] || { salary: 1540, expenses: 0, card: 0 } }));
    setCurrentMonth(next);
    setTab("PAINEL");
    notify(`${currentMonth} arquivado. Novo mês: ${next}.`);
  };

  const recalculateMonth = (month: string, rows: Entry[], current: Record<string, MonthlySummary>) => {
    const previous = current[month] || { salary: 1540, expenses: 0, card: 0 };
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
    notify("Lançamento atualizado.");
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
    notify("Lançamento apagado.");
  };

  const register = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(form.value.replace(",", "."));
    if (!form.person || !form.origin || !form.expense || !value) {
      notify("Preencha pessoa, origem, despesa e valor.");
      return;
    }
    setEntries((current) => [{ id: Date.now(), person: form.person, origin: form.origin, expense: form.expense, value }, ...current]);
    setSummaries((current) => { const previous = current[currentMonth] || { salary: 1540, expenses: 0, card: 0 }; return { ...current, [currentMonth]: { ...previous, expenses: previous.expenses + value, card: previous.card + (form.origin === "CARTÃO" ? value : 0) } }; });
    setForm({ person: "", origin: "", expense: "", value: "" });
    notify("Registro adicionado ao histórico.");
    setTab("HISTÓRICO");
  };

  return (
    <div className="sheet-app" style={{ "--theme-primary": palette.primary, "--theme-background": palette.background, "--theme-card": palette.card, "--theme-text": palette.text } as React.CSSProperties}>
      <header className="sheet-topbar"><button className="sheet-brand account-button" type="button" onClick={(event) => { event.preventDefault(); openAccount(); }}><span className="sheet-logo">+</span><span><strong>Conta de {selectedPerson} 2026</strong><small>{currentMonth}</small></span></button><div className="top-actions"><button className="new-month-button" type="button" onClick={(event) => { event.preventDefault(); requestNewMonth(); }}>Novo mês</button><button className="undo-button" type="button" onClick={(event) => { event.preventDefault(); undoLastAction(); }} disabled={!canUndo} aria-label="Desfazer última ação" title="Desfazer última ação (Ctrl+Z)"><Undo2 size={16} /></button><button className="top-icon" type="button" onClick={(event) => { event.preventDefault(); setShowSettings(true); }} aria-label="Configurações"><Settings2 size={18} /></button></div></header>
      <main className="sheet-main">
        <nav className="sheet-tabs" aria-label="Seções da planilha">{[["PAINEL", HomeIcon], ["REGISTRO", ClipboardList], ["HISTÓRICO", History], ["CATEGORIAS", BarChart3]].map(([name, Icon]) => <button key={name as string} className={tab === name ? "selected" : ""} type="button" onClick={(event) => { event.preventDefault(); setTab(name as string); }}><Icon size={16} /><span>{name as string}</span></button>)}</nav>
        {message && <div className="sheet-message" role="status">{message}</div>}
        {tab === "PAINEL" && <Dashboard people={people} settings={settingsForPerson} month={currentMonth} archivedMonths={archivedMonths} salary={selectedSalary} expenses={selectedExpenses} leftover={leftover} card={selectedCard} selectedPerson={selectedPerson} onPersonChange={setSelectedPerson} onRegister={() => setTab("REGISTRO")} onHistory={() => setTab("HISTÓRICO")} onCurrentMonth={goToCurrentMonth} onEditSalary={openSalaryEditor} onChart={() => setShowChart(true)} />}
        {tab === "REGISTRO" && <Register form={form} setForm={setForm} onSubmit={register} people={people} origins={origins} expenses={expenses} />}
        {tab === "HISTÓRICO" && <HistoryView entries={filteredEntries} allEntries={selectedEntries} search={search} setSearch={setSearch} month={currentMonth} archivedMonths={archivedMonths} archivedData={archivedData} summaries={summaries} person={selectedPerson} onEdit={editEntry} onDelete={deleteEntry} />}
        {tab === "CATEGORIAS" && <CategoriesView people={people} origins={origins} expenses={expenses} onRename={updateCategory} onAdd={addCategory} onRemove={removeCategory} />}
      </main>
      {showChart && <ChartModal month={currentMonth} people={people} entries={entries} onClose={() => setShowChart(false)} />}
      {showYearOverview && <YearOverview year={new Date().getFullYear()} currentMonth={currentMonth} summaries={summaries} onUpdateSummary={(month, field, value) => setSummaries((current) => ({ ...current, [month]: { ...(current[month] || { salary: 1540, expenses: 0, card: 0 }), [field]: value } }))} onClose={() => setShowYearOverview(false)} />}
      {showSalaryEditor && <div className="salary-editor-backdrop" role="presentation" onClick={() => setShowSalaryEditor(false)}><div className="salary-editor-modal" role="dialog" aria-modal="true" aria-labelledby="salary-editor-title" onClick={(event) => event.stopPropagation()}><span className="modal-kicker">EDITAR SALÁRIO</span><h2 id="salary-editor-title">Salário de {currentMonth}</h2><p>Altere o valor deste mês. O salário ficará salvo no histórico mensal do Supabase.</p><label className="field-label">VALOR DO SALÁRIO<input className="sheet-input" inputMode="decimal" autoFocus value={salaryDraft} onChange={(event) => setSalaryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveSalary(); }} /></label><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => setShowSalaryEditor(false)}>Cancelar</button><button type="button" className="modal-confirm" onClick={saveSalary}>Salvar salário</button></div></div></div>}
      {showSettings && <div className="settings-backdrop" role="presentation" onClick={() => setShowSettings(false)}><div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><div className="settings-heading"><div><span className="modal-kicker">CONFIGURAÇÕES</span><h2 id="settings-title">Indicadores de {selectedPerson}</h2></div><button type="button" className="settings-close" onClick={() => setShowSettings(false)} aria-label="Fechar configurações"><X size={18} /></button></div><p>Regras da planilha: Wesly possui salário e sobra. Os demais perfis mostram apenas despesas e cartão.</p><div className="settings-list">{configurableIndicators.map(([key, label]) => <label className="settings-row" key={key}><span>{label}</span><input type="checkbox" checked={settingsForPerson[key]} readOnly disabled /><span className="toggle-track" aria-hidden="true"><span /></span></label>)}</div><div className="alert-email-section"><span className="palette-title">ALERTA POR E-MAIL</span><p>Quando o salário ficar em R$ 0,00 ou negativo, enviaremos um aviso para este endereço.</p><label className="field-label">E-MAIL DO ALERTA<input className="sheet-input" type="email" value={alertEmail} onChange={(event) => setAlertEmail(event.target.value)} placeholder="seuemail@hotmail.com" /></label></div><div className="palette-section"><span className="palette-title">PALETA DE CORES</span><p>Personalize o visual do sistema. As cores ficam salvas no Supabase.</p><div className="palette-preview" aria-label="Prévia das cores atuais"><span style={{ background: palette.primary }} /><span style={{ background: palette.background }} /><span style={{ background: palette.card }} /><span style={{ background: palette.text }} /></div><div className="palette-grid">{([["primary", "Cor principal"], ["background", "Fundo"], ["card", "Cartões"], ["text", "Texto"]] as const).map(([key, label]) => <label className="palette-color-row" key={key}><span>{label}</span><input type="color" value={palette[key]} onChange={(event) => setPalette((current) => ({ ...current, [key]: event.target.value }))} aria-label={label} /><code>{palette[key]}</code></label>)}</div><button type="button" className="palette-reset" onClick={() => setPalette(defaultPalette)}>Restaurar cores originais</button></div><button type="button" className="settings-done" onClick={closeSettings}>Concluir</button></div></div>}
      {showNewMonthConfirm && <div className="month-modal-backdrop" role="presentation"><div className="month-modal" role="dialog" aria-modal="true" aria-labelledby="new-month-title"><span className="modal-kicker">ARQUIVAR MÊS</span><h2 id="new-month-title">Começar um novo mês?</h2><p>Os lançamentos de <strong>{currentMonth}</strong> serão salvos no histórico e a tela ficará pronta para {nextMonth(currentMonth)}.</p><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => setShowNewMonthConfirm(false)}>Cancelar</button><button type="button" className="modal-confirm" onClick={() => { setShowNewMonthConfirm(false); startNewMonth(); }}>Começar novo mês</button></div></div></div>}
      <nav className="sheet-bottom-nav">{[["PAINEL", HomeIcon], ["REGISTRO", Plus], ["HISTÓRICO", History], ["CATEGORIAS", BarChart3]].map(([name, Icon]) => <button key={name as string} className={tab === name ? "selected" : ""} type="button" onClick={(event) => { event.preventDefault(); setTab(name as string); }}><Icon size={19} /><span>{name as string}</span></button>)}</nav>
    </div>
  );
}

function Dashboard({ people, settings, month, archivedMonths, salary, expenses, leftover, card, selectedPerson, onPersonChange, onRegister, onHistory, onCurrentMonth, onEditSalary, onChart }: { people: string[]; settings: IndicatorSettings; month: string; archivedMonths: string[]; salary: number; expenses: number; leftover: number; card: number; selectedPerson: string; onPersonChange: (name: string) => void; onRegister: () => void; onHistory: () => void; onCurrentMonth: () => void; onEditSalary: () => void; onChart: () => void }) {
  return (
    <section className="panel-view">
      <button type="button" className="month-chip" onClick={onCurrentMonth} aria-label="Abrir mês atual">MÊS ATUAL <strong>{month}</strong></button>
      <div className={`welcome-strip ${!settings.salary ? "without-salary" : ""}`}>
        <div className="welcome-copy"><span>Bem vindo,</span><select className="person-switcher" value={selectedPerson} onChange={(event) => onPersonChange(event.target.value)} aria-label="Selecionar nome">{people.map((person) => <option key={person} value={person}>{person}</option>)}</select><ChevronDown size={15} /></div>
        {settings.salary && <Metric label="Salário" value={salary} editable onClick={onEditSalary} />}
        {settings.expenses && <Metric label="Despesas" value={expenses} />}
        {settings.leftover && <Metric label="Sobrou" value={leftover} />}
        {settings.card && <Metric label="Gastos com cartão" value={card} />}
      </div>
      <div className="dashboard-actions"><button type="button" onClick={(event) => { event.preventDefault(); onRegister(); }} className="green-action"><CirclePlus size={19} /> Registrar despesa</button><button type="button" onClick={(event) => { event.preventDefault(); onHistory(); }} className="light-action"><History size={18} /> Ver histórico</button><button type="button" onClick={(event) => { event.preventDefault(); onChart(); }} className="chart-action"><LineChart size={18} /> Gráfico</button></div>
      <div className="mobile-summary">{settings.salary && <Metric label="Salário" value={salary} editable onClick={onEditSalary} />}{settings.expenses && <Metric label="Despesas" value={expenses} />}{settings.leftover && <Metric label="Sobrou" value={leftover} />}{settings.card && <Metric label="Gastos com cartão" value={card} />}</div>
    </section>
  );
}

function YearOverview({ year, currentMonth, summaries, onUpdateSummary, onClose }: { year: number; currentMonth: string; summaries: Record<string, MonthlySummary>; onUpdateSummary: (month: string, field: "salary" | "expenses" | "card", value: number) => void; onClose: () => void }) {
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return <div className="year-overview-backdrop" role="presentation" onClick={onClose}><div className="year-overview-modal" role="dialog" aria-modal="true" aria-labelledby="year-overview-title" onClick={(event) => event.stopPropagation()}><div className="year-overview-heading"><div><span className="modal-kicker">RESUMO ANUAL EDITÁVEL</span><h2 id="year-overview-title">Gestão de {year}</h2><p>Corrija salário, despesas e cartão de cada mês. As alterações são salvas automaticamente.</p></div><button type="button" className="settings-close" onClick={onClose} aria-label="Fechar resumo anual"><X size={18} /></button></div><div className="year-month-grid">{months.map((month, index) => { const key = `${month} ${year}`; const summary = summaries[key] || { salary: 0, expenses: 0, card: 0 }; const leftover = summary.salary - summary.expenses; return <div className={`year-month-card ${key === currentMonth ? "active" : ""}`} key={month}><div className="year-month-card-heading"><span className="year-month-index">{String(index + 1).padStart(2, "0")}</span><strong>{month}</strong></div><div className="year-summary-fields"><label>Salário<input type="number" min="0" step="0.01" value={summary.salary} onChange={(event) => onUpdateSummary(key, "salary", Number(event.target.value) || 0)} /></label><label>Despesas<input type="number" min="0" step="0.01" value={summary.expenses} onChange={(event) => onUpdateSummary(key, "expenses", Number(event.target.value) || 0)} /></label><label>Cartão<input type="number" min="0" step="0.01" value={summary.card} onChange={(event) => onUpdateSummary(key, "card", Number(event.target.value) || 0)} /></label><label className="year-leftover">Sobra<strong>{brl.format(leftover)}</strong></label></div></div>; })}</div><button type="button" className="settings-done" onClick={onClose}><CalendarDays size={16} /> Concluir alterações</button></div></div>;
}

function ChartModal({ month, people, entries, onClose }: { month: string; people: string[]; entries: Entry[]; onClose: () => void }) {
  const data = people.map((person) => ({ name: person, total: entries.filter((entry) => entry.person === person).reduce((sum, entry) => sum + entry.value, 0) }));
  return <div className="chart-backdrop" role="presentation" onClick={onClose}><div className="chart-modal" role="dialog" aria-modal="true" aria-labelledby="chart-title" onClick={(event) => event.stopPropagation()}><div className="chart-heading"><div><span className="modal-kicker">VISÃO DO MÊS</span><h2 id="chart-title">Gastos por pessoa</h2><p>{month} · total lançado no mês atual</p></div><button type="button" className="settings-close" onClick={onClose} aria-label="Fechar gráfico"><X size={18} /></button></div><div className="chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 8 }}><CartesianGrid stroke="#e5efe2" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#6e8469", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#8a9984", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(value) => `R$ ${value}`} /><Tooltip formatter={(value) => [brl.format(Number(value)), "Gastos"]} contentStyle={{ borderRadius: 12, border: "1px solid #d5e8d0", boxShadow: "0 8px 22px rgba(53,91,47,.12)" }} /><Bar dataKey="total" name="Gastos" fill="#5da653" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="chart-total">Total do mês: <strong>{brl.format(data.reduce((sum, item) => sum + item.total, 0))}</strong></div></div></div>;
}

function Metric({ label, value, editable, onClick }: { label: string; value: number; editable?: boolean; onClick?: () => void }) {
  const content = <><span>{label}{editable && <small className="metric-edit-hint"> editar</small>}</span><strong>{brl.format(value)}</strong></>;
  return editable ? <button type="button" className="metric metric-editable" onClick={onClick} aria-label={`Editar ${label}`}>{content}</button> : <div className="metric">{content}</div>;
}

function Register({ form, setForm, onSubmit, people, origins, expenses }: { people: string[]; origins: string[]; expenses: string[]; form: { person: string; origin: string; expense: string; value: string }; setForm: React.Dispatch<React.SetStateAction<{ person: string; origin: string; expense: string; value: string }>>; onSubmit: (event: FormEvent) => void }) {
  return <section className="register-view"><div className="section-title"><span>REGISTRO</span><h1>Adicionar despesa</h1><p>Preencha os campos abaixo e toque em registrar.</p></div><form className="register-card" onSubmit={onSubmit}><Field label="PESSOA"><Select value={form.person} placeholder="Selecione uma pessoa" options={people} onChange={(value) => setForm((current) => ({ ...current, person: value }))} /></Field><Field label="ORIGEM"><Select value={form.origin} placeholder="Selecione a origem" options={origins} onChange={(value) => setForm((current) => ({ ...current, origin: value }))} /></Field><Field label="DESPESA"><Select value={form.expense} placeholder="Selecione a despesa" options={expenses} onChange={(value) => setForm((current) => ({ ...current, expense: value }))} /></Field><label className="field-label">VALOR<input className="sheet-input" inputMode="decimal" placeholder="R$ 0,00" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></label><button className="register-button" type="submit">REGISTRAR</button></form></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field-label">{label}{children}</label>; }
function Select({ value, placeholder, options, onChange }: { value: string; placeholder: string; options: string[]; onChange: (value: string) => void }) { return <div className="select-wrap"><select className="sheet-input" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={15} /></div>; }

function HistoryView({ entries, allEntries, search, setSearch, month, archivedMonths, archivedData, summaries, person, onEdit, onDelete }: { entries: Entry[]; allEntries: Entry[]; search: string; setSearch: (value: string) => void; month: string; archivedMonths: string[]; archivedData: Record<string, Entry[]>; summaries: Record<string, MonthlySummary>; person: string; onEdit: (month: string, entry: Entry) => void; onDelete: (month: string, id: number) => void }) {
  const [exportMonth, setExportMonth] = useState(month);
  const [exportMessage, setExportMessage] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ month: string; entry: Entry } | null>(null);
  const [draft, setDraft] = useState<Entry | null>(null);
  const startEdit = (archiveMonth: string, entry: Entry) => { setEditing({ month: archiveMonth, entry }); setDraft({ ...entry }); };
  const saveEdit = () => { if (editing && draft && draft.person.trim() && draft.origin.trim() && draft.expense.trim() && draft.value > 0) { onEdit(editing.month, { ...draft, person: draft.person.trim(), origin: draft.origin.trim(), expense: draft.expense.trim() }); setEditing(null); setDraft(null); } };
  const rows = (items: Entry[], rowMonth: string) => items.map((entry) => <div className="table-row history-row" key={`${rowMonth}-${entry.id}`}><span>{entry.person}</span><span>{entry.origin}</span><span>{entry.expense}</span><strong>{brl.format(entry.value)}</strong><div className="row-actions"><button type="button" onClick={() => startEdit(rowMonth, entry)} aria-label="Editar lançamento"><Pencil size={14} /></button><button type="button" onClick={() => onDelete(rowMonth, entry.id)} aria-label="Apagar lançamento"><Trash2 size={14} /></button></div></div>);
  const legacyMonthsHiddenFromExport = new Set(["Junho 2026", "Julho 2026"]);
  const savedMonths = archivedMonths.filter((savedMonth) => savedMonth !== month && !legacyMonthsHiddenFromExport.has(savedMonth) && Object.prototype.hasOwnProperty.call(archivedData, savedMonth));
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
  return <section className="history-view"><div className="section-title"><span>HISTÓRICO</span><h1>Lançamentos registrados</h1><p>Registros de {month} para {person}. Meses anteriores ficam ocultos.</p></div><div className="export-panel"><div><span>EXPORTAR PLANILHA</span><strong>Escolha o mês desejado</strong></div><div className="export-controls"><select className="export-month-select" value={exportMonth} onChange={(event) => setExportMonth(event.target.value)} aria-label="Mês para exportar">{monthOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><button type="button" className="export-button" onClick={exportSpreadsheet}><Download size={16} /> Exportar</button></div></div>{exportMessage && <div className="export-message" role="status">{exportMessage}</div>}<div className="history-toolbar"><div className="sheet-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar pessoa, origem ou despesa" />{search && <button type="button" onClick={(event) => { event.preventDefault(); setSearch(""); }} aria-label="Limpar pesquisa"><X size={15} /></button>}</div></div>{Object.keys(archivedData).length > 0 && <button type="button" className="archived-toggle" onClick={() => setShowArchived((current) => !current)}>{showArchived ? "Ocultar meses anteriores" : "Mostrar meses anteriores"}</button>}<div className="history-table"><div className="table-head"><span>PESSOA</span><span>ORIGEM</span><span>DESPESA</span><span>VALOR</span></div>{rows(entries, month)}{entries.length === 0 && <div className="no-results">Nenhum registro registrado em {month}.</div>}</div>{showArchived && Object.entries(archivedData).map(([archiveMonth, archiveEntries]) => <div className="archive-block" key={archiveMonth}><div className="archive-heading">{archiveMonth} salvo</div><div className="history-table"><div className="table-head"><span>PESSOA</span><span>ORIGEM</span><span>DESPESA</span><span>VALOR</span></div>{rows(archiveEntries, archiveMonth)}</div></div>)}{editing && draft && <div className="edit-entry-backdrop" role="presentation"><div className="edit-entry-modal" role="dialog" aria-modal="true"><span className="modal-kicker">EDITAR LANÇAMENTO</span><h2>{editing.month}</h2><input value={draft.person} onChange={(event) => setDraft({ ...draft, person: event.target.value })} aria-label="Pessoa" /><input value={draft.origin} onChange={(event) => setDraft({ ...draft, origin: event.target.value })} aria-label="Origem" /><input value={draft.expense} onChange={(event) => setDraft({ ...draft, expense: event.target.value })} aria-label="Despesa" /><input inputMode="decimal" value={String(draft.value).replace(".", ",")} onChange={(event) => setDraft({ ...draft, value: Number(event.target.value.replace(",", ".")) || 0 })} aria-label="Valor" /><div className="month-modal-actions"><button type="button" className="modal-cancel" onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</button><button type="button" className="modal-confirm" onClick={saveEdit}>Salvar</button></div></div></div>}</section>;
}

function CategoriesView({ people, origins, expenses, onRename, onAdd, onRemove }: { people: string[]; origins: string[]; expenses: string[]; onRename: (kind: "people" | "origins" | "expenses", index: number, name: string) => void; onAdd: (kind: "people" | "origins" | "expenses", name: string) => void; onRemove: (kind: "people" | "origins" | "expenses", index: number) => void }) {
  return <section className="categories-view"><div className="section-title"><span>CATEGORIAS</span><h1>Listas editáveis</h1><p>Altere qualquer nome; a mudança é salva e atualiza os registros do sistema.</p></div><div className="category-columns"><Category title="PESSOAS" kind="people" items={people} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /><Category title="ORIGEM" kind="origins" items={origins} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /><Category title="DESPESAS" kind="expenses" items={expenses} onRename={onRename} onAdd={onAdd} onRemove={onRemove} /></div></section>;
}
function Category({ title, kind, items, onRename, onAdd, onRemove }: { title: string; kind: "people" | "origins" | "expenses"; items: string[]; onRename: (kind: "people" | "origins" | "expenses", index: number, name: string) => void; onAdd: (kind: "people" | "origins" | "expenses", name: string) => void; onRemove: (kind: "people" | "origins" | "expenses", index: number) => void }) {
  const [newName, setNewName] = useState("");
  return <div className="category-card"><h2>{title}</h2>{items.map((item, index) => <div className="category-edit-row" key={`${kind}-${index}`}><input value={item} onChange={(event) => onRename(kind, index, event.target.value)} aria-label={`Editar ${title.toLocaleLowerCase()} ${index + 1}`} /><button type="button" onClick={() => onRemove(kind, index)} aria-label={`Excluir ${item}`}>×</button></div>)}<form className="category-add" onSubmit={(event) => { event.preventDefault(); onAdd(kind, newName); setNewName(""); }}><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Adicionar novo" /><button type="submit">Adicionar</button></form></div>;
}
