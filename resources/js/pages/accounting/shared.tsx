import { useApi } from '../../hooks/useApi';

export type AccountType = { id: number; name: string; group: 'asset' | 'liability' | 'equity' | 'income' | 'expense' };
export type DetailType = { id: number; account_type_id: number; name: string };
export type AccountRow = {
    id: number;
    key_name: string | null;
    number: string | null;
    name: string;
    parent_id: number | null;
    parent: string | null;
    account_type_id: number;
    account_detail_type_id: number | null;
    type: string;
    detail_type: string | null;
    description: string | null;
    active: boolean;
    bank_account: string | null;
    bank_name: string | null;
    opening_balance: number | null;
    balance_as_of: string | null;
    balance: number;
    has_transactions: boolean;
};
export type AccountsReply = { data: AccountRow[]; meta: { types: AccountType[]; detail_types: DetailType[] } };

/** All accounts (for selects); active ones first. */
export function useAccounts() {
    return useApi<AccountsReply>('/accounting/accounts');
}

export const accountLabel = (a: Pick<AccountRow, 'number' | 'name'>) => (a.number ? `${a.number} - ${a.name}` : a.name);

export const REL_LABELS: Record<string, string> = { journal_entry: 'Journal entry', transfer: 'Transfer', opening_balance: 'Opening balance' };
