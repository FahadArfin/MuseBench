import type {FinanceData,FinanceCsvOptions,FinanceTransaction} from './finance-types';
export function currencyDigits(currency:string):number;
export function moneyMinor(value:string|number,currency?:string):number;
export function formatMoney(value:number,currency?:string):string;
export function financeDate(value:string):string;
export function parseFinanceCsv(text:string,options?:FinanceCsvOptions):{headers:string[];rows:Omit<FinanceTransaction,'id'|'itemId'|'accountId'>[]};
export interface FinanceSummary {month:string;currency:string;income:number;spending:number;cashFlow:number;assets:number;debt:number;netWorth:number|null;unknownBalances:number;accountCount:number;pending:number;transactionCount:number;previousSpending:number;categories:{category:string;amountMinor:number;budgetMinor:number|null}[];months:{month:string;income:number;spending:number}[];recurring:{merchant:string;accountId:string;amountMinor:number;currency:string;cadence:string;nextDate:string;estimated:boolean;occurrences:number;change:number}[];possibleDuplicates:{merchant:string;date:string;amountMinor:number;count:number}[];currencies:string[];}
export function financeSummary(data:Pick<FinanceData,'accounts'|'transactions'|'budgets'>,options?:{month?:string;currency?:string;today?:string}):FinanceSummary;
export function financeQuestion(question:string,summary:FinanceSummary):string;
export function financeSample(today?:string):FinanceData;
