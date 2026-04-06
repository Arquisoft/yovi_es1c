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

    it("renders all selects and button when authenticated", () => {
        setupAuthenticatedUser();
        renderWithProviders(<CreateMatchPage />);

        const boardSizeSelect = screen.getByLabelText(/Tamaño del tablero/i);
        const gameModeSelect = screen.getByLabelText(/Modo de juego/i);
        const difficultySelect = screen.getByLabelText(/Dificultad/i);
        const createButton = screen.getByRole("button", { name: /Crear partida/i });

        expect(boardSizeSelect).toBeInTheDocument();
        expect(gameModeSelect).toBeInTheDocument();
        expect(difficultySelect).toBeInTheDocument();
        expect(createButton).toBeInTheDocument();
    });

    it("shows login prompt when not authenticated", () => {
        renderWithProviders(<CreateMatchPage />);

        expect(screen.getByText(/Debes iniciar sesión para crear una partida/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Ir a Login/i })).toBeInTheDocument();
    });

    it("navigates to login when clicking 'Ir a Login' button", () => {
        renderWithProviders(<CreateMatchPage />);

        const loginButton = screen.getByRole("button", { name: /Ir a Login/i });
        fireEvent.click(loginButton);

        expect(mockNavigate).toHaveBeenCalledWith("/login");
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
                    mode: "BOT",
                    difficulty: "medium"
                },
            });
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

    it("changes board size when user selects a different option", async () => {
        setupAuthenticatedUser();
        renderWithProviders(<CreateMatchPage />);

        const slider = screen.getByRole('slider', { name: /TAMAÑO DEL TABLERO/i });
        fireEvent.change(slider, { target: { value: 16 } });

        await waitFor(() => {
            expect(screen.getByText(/16 x 16/i)).toBeInTheDocument();
        });
    });

    it("changes difficulty when user selects a different option", async () => {
        setupAuthenticatedUser();
        renderWithProviders(<CreateMatchPage />);

        const difficultyButton = screen.getByText(/Media/i).closest('[role="combobox"]');
        fireEvent.mouseDown(difficultyButton!);
        const hardOption = await screen.findByRole("option", { name: /Difícil/i });
        fireEvent.click(hardOption);
        await waitFor(() => {
            expect(screen.getByText(/Difícil/i)).toBeInTheDocument();
        });
    });

    it("changes mode to LOCAL_2P and hides difficulty selector", async () => {
        setupAuthenticatedUser();
        renderWithProviders(<CreateMatchPage />);

        expect(screen.getByText(/MEDIA/i)).toBeInTheDocument();

        const modeButton = screen.getByLabelText("Modo de juego") || screen.getByText("VS BOT");
        fireEvent.mouseDown(modeButton!);
        const local2pOption = await screen.findByRole("option", { name: "2 JUGADORES (LOCAL)" });
        fireEvent.click(local2pOption);

        await waitFor(() => {
            expect(screen.getByText("2 JUGADORES (LOCAL)")).toBeInTheDocument();
            expect(screen.queryByText(/MEDIA/i)).not.toBeInTheDocument();
        });
    });

    it("shows difficulty selector again when switching back to BOT mode", async () => {
        setupAuthenticatedUser();
        renderWithProviders(<CreateMatchPage />);

        let modeButton = screen.getByText("VS BOT").closest('[role="button"]') || screen.getByLabelText("Modo de juego");
        fireEvent.mouseDown(modeButton!);
        const local2pOption = await screen.findByRole("option", { name: "2 JUGADORES (LOCAL)" });
        fireEvent.click(local2pOption);

        await waitFor(() => {
            expect(screen.queryByText(/MEDIA/i)).not.toBeInTheDocument();
        });

        modeButton = screen.getByText("2 JUGADORES (LOCAL)").closest('[role="button"]') || screen.getByLabelText("Modo de juego");
        fireEvent.mouseDown(modeButton!);
        const botOption = await screen.findByRole("option", { name: "VS BOT" });
        fireEvent.click(botOption);

        await waitFor(() => {
            expect(screen.getByText(/MEDIA/i)).toBeInTheDocument();
        });
    });

    it("displays error message when API call fails", async () => {
        setupAuthenticatedUser();

        fetchMock.mockResolvedValueOnce(
            Promise.resolve({
                ok: false,
                status: 400,
                text: () => Promise.resolve("Invalid board size"),
                json: () => Promise.reject(new Error("Not JSON")),
                headers: new Headers(),
            } as Response)
        );

        renderWithProviders(<CreateMatchPage />);

        const createButton = screen.getByRole("button", { name: /Crear partida/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(screen.getByText(/Invalid board size/i)).toBeInTheDocument();
        });
    });

    it("disables button while loading", async () => {
        setupAuthenticatedUser();

        let resolvePromise: (value: Response) => void = () => {};
        const pendingPromise = new Promise<Response>((resolve) => { resolvePromise = resolve; });
        fetchMock.mockReturnValueOnce(pendingPromise);

        renderWithProviders(<CreateMatchPage />);

        const createButton = screen.getByRole("button", { name: /CREAR PARTIDA/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(createButton).toBeDisabled();
            expect(screen.getByText(/INICIALIZANDO/i)).toBeInTheDocument();
        });

        resolvePromise(new Response(JSON.stringify({ matchId: "123", initialYEN: {} }), {
            status: 200,
            headers: new Headers({ 'Content-Type': 'application/json' }),
        }));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalled();
        });
    });

    it("handles unknown error gracefully", async () => {
        setupAuthenticatedUser();

        fetchMock.mockRejectedValueOnce("Something weird happened");

        renderWithProviders(<CreateMatchPage />);

        const createButton = screen.getByRole("button", { name: /Crear partida/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(screen.getByText(/Error desconocido/i)).toBeInTheDocument();
        });
    });

    it("sends correct difficulty in LOCAL_2P mode", async () => {
        setupAuthenticatedUser();

        fetchMock.mockResolvedValueOnce(
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ matchId: "123", initialYEN: {} }),
                text: () => Promise.resolve(JSON.stringify({ matchId: "123", initialYEN: {} })),
                headers: new Headers({ 'Content-Type': 'application/json' }),
            } as Response)
        );

        renderWithProviders(<CreateMatchPage />);

        const modeButton = screen.getByText("VS BOT").closest('[role="button"]') || screen.getByLabelText("Modo de juego");
        fireEvent.mouseDown(modeButton!);
        const local2pOption = await screen.findByRole("option", { name: "2 JUGADORES (LOCAL)" });
        fireEvent.click(local2pOption);

        await waitFor(() => {
            expect(screen.getByText("2 JUGADORES (LOCAL)")).toBeInTheDocument();
        });

        const createButton = screen.getByRole("button", { name: /CREAR PARTIDA/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
            const callArgs = fetchMock.mock.calls[0];
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody).toEqual({
                boardSize: 8,
                difficulty: "medium",
                mode: "LOCAL_2P",
            });
        });
    });

    it("changes all selects to non-default values before creating match", async () => {
        setupAuthenticatedUser();

        fetchMock.mockResolvedValueOnce(
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ matchId: "456", initialYEN: {} }),
                text: () => Promise.resolve(JSON.stringify({ matchId: "456", initialYEN: {} })),
                headers: new Headers({ 'Content-Type': 'application/json' }),
            } as Response)
        );

        renderWithProviders(<CreateMatchPage />);

        // Cambiar boardSize
        const slider = screen.getByRole('slider', { name: /TAMAÑO DEL TABLERO/i });
        fireEvent.change(slider, { target: { value: 32 } });
        await waitFor(() => expect(screen.getByText(/32 x 32/i)).toBeInTheDocument());

        // Cambiar dificultad
        const difficultyButton = screen.getByLabelText("Dificultad") || screen.getByText("MEDIA");
        fireEvent.mouseDown(difficultyButton!);
        const easyOption = await screen.findByRole("option", { name: "FÁCIL" });
        fireEvent.click(easyOption);
        await waitFor(() => expect(screen.getByText(/FÁCIL/i)).toBeInTheDocument());

        const createButton = screen.getByRole("button", { name: /CREAR PARTIDA/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/gamey", {
                state: {
                    matchId: "456",
                    initialYEN: {},
                    boardSize: 32,
                    mode: "BOT",
                    difficulty: "easy",
                },
            });
        });
    });
});
