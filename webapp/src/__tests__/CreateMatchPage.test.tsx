import { describe, it, vi, beforeEach, afterEach, expect } from "vitest";
import { renderWithProviders, setupAuthenticatedUser, clearAuth, screen, fireEvent, waitFor } from "./test-utils";
import CreateMatchPage from "../features/game/ui/tsx/CreateMatchPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe("CreateMatchPage Component", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        clearAuth();
        fetchMock = vi.fn() as ReturnType<typeof vi.fn>;
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        clearAuth();
        vi.restoreAllMocks();
    });

    it("renders all selects and button", () => {
        setupAuthenticatedUser();
        renderWithProviders(<CreateMatchPage />);

        expect(screen.getByText(/Tamaño del tablero/i)).toBeInTheDocument();
        expect(screen.getByText(/Estrategia/i)).toBeInTheDocument();
        expect(screen.getByText(/Dificultad/i)).toBeInTheDocument();
        expect(screen.getByText(/Modo de juego/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Crear partida/i })).toBeInTheDocument();
    });

    it("navigates correctly on successful match creation", async () => {
        setupAuthenticatedUser();

        const fakeData = { matchId: "123", initialYEN: {} };

        fetchMock.mockResolvedValueOnce(
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve(fakeData),
                text: () => Promise.resolve(JSON.stringify(fakeData)),
                headers: new Headers({ 'Content-Type': 'application/json' }),
            } as Response)
        );

        renderWithProviders(<CreateMatchPage />);

        const createButton = screen.getByRole("button", { name: /Crear partida/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/gamey", {
                state: {
                    matchId: fakeData.matchId,
                    initialYEN: fakeData.initialYEN,
                    boardSize: 8,
                    mode: "BOT"
                },
            });
        });
    });

    it("shows error when JWT token is missing", async () => {
        renderWithProviders(<CreateMatchPage />);

        const createButton = screen.getByRole("button", { name: /Crear partida/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(screen.getByText(/No JWT token found/i)).toBeInTheDocument();
        });
    });

    it("shows error when API responds with error", async () => {
        setupAuthenticatedUser();

        fetchMock.mockResolvedValueOnce(
            Promise.resolve({
                ok: false,
                status: 500,
                text: () => Promise.resolve("API error"),
                json: () => Promise.reject(new Error("Not JSON")),
                headers: new Headers(),
            } as Response)
        );

        renderWithProviders(<CreateMatchPage />);

        const createButton = screen.getByRole("button", { name: /Crear partida/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(screen.getByText(/API error/i)).toBeInTheDocument();
        });
    });
});
