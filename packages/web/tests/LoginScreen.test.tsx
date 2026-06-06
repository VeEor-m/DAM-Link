import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../src/components/auth/LoginScreen';

// Mock the API module before importing the component.
vi.mock('../src/api/auth.js', () => ({
  login: vi.fn(),
  register: vi.fn(),
}));

// api/client is not exercised here yet; importing it is harmless.
import { ApiError } from '../src/api/client.js';

describe('LoginScreen default render (T1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the magazine-cover copy and the email + password fields', () => {
    render(<LoginScreen onSuccess={() => {}} />);

    // Headline + meta
    expect(
      screen.getByRole('heading', { level: 1, name: /an archive, organized/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/vol\. 01 \/ no\. 26 \/ 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in to your library/i)).toBeInTheDocument();

    // Fields (login mode: no name)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();

    // Submit button
    expect(
      screen.getByRole('button', { name: /^sign in\s*→?$/i }),
    ).toBeInTheDocument();

    // Mode switch
    expect(
      screen.getByRole('button', { name: /^register$/i }),
    ).toBeInTheDocument();

    // No error visible
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
