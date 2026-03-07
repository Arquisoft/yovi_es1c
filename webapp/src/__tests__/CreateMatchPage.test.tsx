import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import CreateMatchPage from "../features/game/ui/tsx/CreateMatchPage";
import { describe, it, vi, beforeEach, afterEach, expect } from "vitest";

// Mock de useNavigate antes de importar el componente
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
        vi.restoreAllMocks();
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        vi.stubGlobal("localStorage", {
            getItem: vi.fn(() => "fake-jwt-token"),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const renderComponent = () =>
        render(
            <BrowserRouter>
                <CreateMatchPage />
            </BrowserRouter>
        );

    it("renders all selects and button", () => {
        renderComponent();

        expect(screen.getByText(/Tamaño del tablero/i)).toBeInTheDocument();
        expect(screen.getByText(/Estrategia/i)).toBeInTheDocument();
        expect(screen.getByText(/Dificultad/i)).toBeInTheDocument();
        expect(screen.getByText(/Modo de juego/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Crear partida/i })).toBeInTheDocument();
    });

    it("navigates correctly on successful match creation", async () => {
        const fakeData = { matchId: "123", initialYEN: {} };
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify(fakeData), { status: 200, headers: { "Content-Type": "application/json" } })
        );

        renderComponent();

        const createButton = screen.getByRole("button", { name: /Crear partida/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/gamey", {
                state: { matchId: fakeData.matchId, initialYEN: fakeData.initialYEN, boardSize: 8, mode: "BOT" },
            });
        });
    });

    it("shows error when JWT token is missing", async () => {
        vi.stubGlobal("localStorage", {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
        });

        renderComponent();
        const createButton = screen.getByRole("button", { name: /Crear partida/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(screen.getByText(/No JWT token found/i)).toBeInTheDocument();
        });
    });

    it("shows error when API responds with error", async () => {
        fetchMock.mockResolvedValueOnce(new Response("API error", { status: 500 }));

        renderComponent();
        const createButton = screen.getByRole("button", { name: /Crear partida/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(screen.getByText(/API error/i)).toBeInTheDocument();
        });
    });
});