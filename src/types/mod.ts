export interface Mod {
    id: string;
    name: string;
    path: string;
    sortName: string;
    enabled: boolean;
    hasConflict?: boolean;
}