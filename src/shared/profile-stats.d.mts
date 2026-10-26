export function profileStats(tasks: {createdAt: string}[], now?: Date): {
 total: number; thisMonth: number; longest: number; current: number; activeDays: number;
 days: {date: string; count: number; future: boolean}[];
 weeks: {date: string; count: number; cumulative: number}[];
};
