/** All monetary amounts are integers in the currency's minor unit (e.g. cents, paise). */
export type Minor = number;
export type ID = string;

export interface Member {
  id: ID;
  name: string;
  /** Optional UPI ID / payment handle used to build "pay now" links. */
  upi?: string;
}

export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares' | 'adjust' | 'itemized';

export interface SplitItem {
  id: ID;
  name: string;
  amount: Minor;
  memberIds: ID[];
}

export interface Split {
  mode: SplitMode;
  /** Members taking part (equal / percent / shares / adjust / exact). */
  participants: ID[];
  /**
   * Per-member values, meaning depends on mode:
   * exact → minor units, percent → percent (0–100), shares → weight, adjust → minor-unit adjustment.
   */
  values?: Record<ID, number>;
  /** Itemized bills: each item is shared equally by its members; the remainder (tax/tip/discount) is spread proportionally. */
  items?: SplitItem[];
}

export interface Payer {
  memberId: ID;
  amount: Minor;
}

export type Frequency = 'weekly' | 'monthly' | 'yearly';

export interface Expense {
  id: ID;
  groupId: ID;
  kind: 'expense' | 'payment';
  description: string;
  category: string;
  currency: string;
  amount: Minor;
  /** Units of the group's base currency per 1 unit of `currency`, frozen when the expense was recorded. */
  fxRate: number;
  date: string; // YYYY-MM-DD
  payers: Payer[];
  split: Split;
  notes?: string;
  recurring?: { freq: Frequency; nextDate: string };
  recurringSourceId?: ID;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Group {
  id: ID;
  name: string;
  emoji: string;
  baseCurrency: string;
  members: Member[];
  /** Which member is the person using this device — enables "you owe / you are owed" views. */
  meId?: ID;
  /** Default exchange rates to the base currency, used to prefill new expenses. */
  rates: Record<string, number>;
  /** Monthly budget in base-currency minor units. */
  monthlyBudget?: Minor;
  simplifyDebts: boolean;
  createdAt: number;
  archived?: boolean;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  defaultCurrency: string;
}

export interface AppState {
  version: 1;
  groups: Group[];
  expenses: Expense[];
  settings: Settings;
}

export const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '🧾' },
  { id: 'food', label: 'Food & drink', icon: '🍽️' },
  { id: 'groceries', label: 'Groceries', icon: '🛒' },
  { id: 'transport', label: 'Transport', icon: '🚕' },
  { id: 'travel', label: 'Travel & stay', icon: '🏨' },
  { id: 'rent', label: 'Rent', icon: '🏠' },
  { id: 'utilities', label: 'Utilities', icon: '💡' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
  { id: 'health', label: 'Health', icon: '💊' },
  { id: 'gifts', label: 'Gifts', icon: '🎁' },
  { id: 'other', label: 'Other', icon: '📦' },
];

export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
