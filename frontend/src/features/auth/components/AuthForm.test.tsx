import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from './AuthForm';

describe('AuthForm', () => {
  test('login mode submits username + password', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AuthForm mode="login" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/username/i), 'tester');
    await user.type(screen.getByLabelText(/password/i), 'secretpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(onSubmit).toHaveBeenCalledWith({ username: 'tester', password: 'secretpass' });
  });

  test('register mode requires displayName + country', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AuthForm mode="register" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/username/i),    'newbie');
    await user.type(screen.getByLabelText(/password/i),    'secretpass');
    await user.type(screen.getByLabelText(/display name/i), 'Newbie');
    await user.type(screen.getByLabelText(/country/i),     'TR');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      username: 'newbie', password: 'secretpass', displayName: 'Newbie', country: 'TR',
    });
  });

  test('shows server error message', () => {
    render(<AuthForm mode="login" onSubmit={vi.fn()} errorMessage="invalid credentials" />);
    expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
  });

  test('disables submit when pending', () => {
    render(<AuthForm mode="login" onSubmit={vi.fn()} pending />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });
});
