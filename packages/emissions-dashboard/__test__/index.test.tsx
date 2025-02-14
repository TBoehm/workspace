import React from 'react';
import { render, screen } from '@testing-library/react';
import Index from '../pages/index';

describe('Index page', () => {
  it('should render elements properly', () => {
    render(<Index />);

    expect(screen.getByText('Dashboard coming soon')).toBeInTheDocument();
  });
});
