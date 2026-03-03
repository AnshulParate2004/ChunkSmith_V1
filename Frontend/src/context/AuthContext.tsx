import { createContext, useContext, useEffect, useState } from "react";
import { apiService } from "@/services/api";
import { getCookie, setCookie, deleteCookie } from "@/utils/cookies";

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
        // Check for existing session in cookies/localStorage
        const accessToken = getCookie("chunksmith_access_token");
        const storedUser = localStorage.getItem("user");

        if (accessToken && storedUser) {
            const parsedUser = JSON.parse(storedUser);

            apiService
                .getSession(accessToken)
                .then(() => {
                    setSession({ access_token: accessToken, refresh_token: "" });
                    setUser(parsedUser);
                })
                .catch(() => {
                    deleteCookie("chunksmith_access_token");
                    localStorage.removeItem("user");
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

        // Store user in localStorage
        localStorage.setItem("user", JSON.stringify(response.user));

        // Store JWT in cookie only if user accepted cookies
        const consent = getCookie("chunksmith_cookie_consent");
        if (consent === "true") {
            setCookie("chunksmith_access_token", response.session.access_token, 7);
        }
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
        deleteCookie("chunksmith_access_token");
        localStorage.removeItem("user");
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, login, signup, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};
