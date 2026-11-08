export type PaidExpenses = Record<string, boolean>;

export function paidExpenseKey(month: string, expense: string) {
  return `${month}::${expense}`;
}

export function isPaidExpense(state: PaidExpenses, month: string, expense: string) {
  return Boolean(state[paidExpenseKey(month, expense)]);
}

export function togglePaidExpense(state: PaidExpenses, month: string, expense: string) {
  const key = paidExpenseKey(month, expense);
  return { ...state, [key]: !state[key] };
}

export function normalizePaidExpenses(value: unknown, month: string): PaidExpenses {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, paid]) => {
    if (typeof paid !== "boolean") return [];
    return [[key.includes("::") ? key : paidExpenseKey(month, key), paid]];
  }));
}

export function renamePaidExpense(state: PaidExpenses, previous: string, next: string) {
  const result = { ...state };
  Object.entries(state).forEach(([key, paid]) => {
    if (key === previous) {
      result[next] = paid;
      delete result[key];
    } else if (key.endsWith(`::${previous}`)) {
      result[`${key.slice(0, -previous.length)}${next}`] = paid;
      delete result[key];
    }
  });
  return result;
}

export function removePaidExpense(state: PaidExpenses, expense: string) {
  return Object.fromEntries(Object.entries(state).filter(([key]) => key !== expense && !key.endsWith(`::${expense}`)));
}
