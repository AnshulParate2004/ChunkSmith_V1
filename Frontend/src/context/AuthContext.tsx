import { createContext, useContext, useEffect, useState } from "react";
import { apiService } from "@/services/api";

interface User {
    id: string;
    email: string;
}

interface Session {
    access_token: string;
    refresh_token: string;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    loading: true,
    login: async () => { },
    signup: async () => { },
    signOut: async () => { },
});

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for existing session in localStorage
        const storedSession = localStorage.getItem('session');
        const storedUser = localStorage.getItem('user');

        if (storedSession && storedUser) {
            const parsedSession = JSON.parse(storedSession);
            const parsedUser = JSON.parse(storedUser);

            // Verify session is still valid
            apiService.getSession(parsedSession.access_token)
                .then(() => {
                    setSession(parsedSession);
                    setUser(parsedUser);
                })
                .catch(() => {
                    // Session invalid, clear storage
                    localStorage.removeItem('session');
                    localStorage.removeItem('user');
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (email: string, password: string) => {
        const response = await apiService.login(email, password);
        setUser(response.user);
        setSession(response.session);

        // Store in localStorage
        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('session', JSON.stringify(response.session));
    };

    const signup = async (email: string, password: string) => {
        await apiService.signup(email, password);
    };

    const signOut = async () => {
        if (session) {
            try {
                await apiService.logout(session.access_token);
            } catch (error) {
                console.error('Logout error:', error);
            }
        }

        setUser(null);
        setSession(null);
        localStorage.removeItem('user');
        localStorage.removeItem('session');
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, login, signup, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};
