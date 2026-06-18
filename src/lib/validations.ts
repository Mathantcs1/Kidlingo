import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  val === "" || val === null ? undefined : val;

const optionalPositiveNumber = () =>
  z.preprocess(emptyToUndefined, z.coerce.number().positive().optional().nullable());

const optionalNonNegativeNumber = () =>
  z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional().nullable());

const optionalPositiveInt = () =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional().nullable());

const optionalDate = () =>
  z.preprocess(emptyToUndefined, z.coerce.date().optional().nullable());

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerSchema = loginSchema
  .extend({
    name: z.string().min(2, "Name must be at least 2 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

export const tradeSchema = z.object({
  instrument: z.string().min(1, "Instrument is required").max(20),
  direction: z.enum(["LONG", "SHORT"]),
  entryPrice: z.coerce.number().positive("Entry price must be positive"),
  exitPrice: optionalPositiveNumber(),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  entryDate: z.coerce.date(),
  exitDate: optionalDate(),
  strategyTag: z.string().optional().nullable(),
  sessionType: z.string().optional().nullable(),
  tradeSetup: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  psychology: z.string().max(2000).optional().nullable(),
  screenshotUrl: z.preprocess(emptyToUndefined, z.string().url().optional().nullable()),
  stopLoss: optionalPositiveNumber(),
  takeProfit: optionalPositiveNumber(),
  commission: optionalNonNegativeNumber(),
  groupId: z.string().optional().nullable(),
  tradingAccountId: z.string().optional().nullable(),
  // Options / trade type fields
  tradeType: z.enum(["EQUITY", "OPTIONS"]).default("EQUITY"),
  optionType: z.enum(["CALL", "PUT"]).optional().nullable(),
  strikePrice: optionalPositiveNumber(),
  expirationDate: optionalDate(),
  numContracts: optionalPositiveInt(),
  underlyingPrice: optionalPositiveNumber(),
});

export const tradeFilterSchema = z.object({
  instrument: z.string().optional(),
  direction: z.enum(["LONG", "SHORT"]).optional(),
  strategyTag: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  sortBy: z
    .enum(["entryDate", "pnl", "rMultiple", "instrument"])
    .default("entryDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  aiProvider: z.enum(["CLAUDE", "OPENAI"]).optional(),
  role: z.enum(["ADMIN", "TRADER", "VIEWER"]).optional(),
});

export const tradePlanSchema = z.object({
  date: z.coerce.date(),
  instrument: z.string().min(1).max(20),
  direction: z.enum(["LONG", "SHORT"]),
  entryPrice: z.coerce.number().positive(),
  stopLoss: z.coerce.number().positive(),
  takeProfit: z.coerce.number().positive(),
  rationale: z.string().max(5000).optional().nullable(),
  alertsEnabled: z.boolean().default(true),
});

export const priceAlertSchema = z.object({
  instrument: z.string().min(1).max(20),
  alertType: z.enum(["ENTRY_HIT", "EXIT_HIT", "STOP_HIT", "PRICE_ABOVE", "PRICE_BELOW"]),
  targetPrice: z.coerce.number().positive(),
  message: z.string().max(500).optional().nullable(),
  planId: z.string().optional().nullable(),
});

export const dropdownValueSchema = z.object({
  category: z.enum(["STRATEGY_TAG", "INSTRUMENT", "PSYCHOLOGY_TAG", "TRADE_SETUP", "SESSION_TYPE"]),
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const subscriptionUpdateSchema = z.object({
  plan: z.enum(["FREE", "BASIC", "PRO"]),
  status: z.enum(["ACTIVE", "CANCELLED", "PAST_DUE", "TRIALING"]).optional(),
  trialEndsAt: optionalDate(),
  expiresAt: optionalDate(),
});
