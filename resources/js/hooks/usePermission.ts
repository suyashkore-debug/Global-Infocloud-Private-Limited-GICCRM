import { useAuth } from '../auth/AuthContext';

/** True when the signed-in user has "feature.capability" (admins have everything). */
export function usePermission(permission: string): boolean {
    const { user } = useAuth();

    return !!user && (user.is_admin || user.permissions.includes(permission));
}
