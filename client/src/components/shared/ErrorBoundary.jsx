import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Catches unhandled React rendering errors so the entire app doesn't white-screen.
 * Wrap around <Routes> or any subtree that should degrade gracefully.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-gb-fg">
          <AlertTriangle size={48} className="text-gb-red" />
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-gb-fg3 text-sm max-w-md text-center">
            {this.state.error?.message || 'An unexpected error occurred while rendering the page.'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 mt-2 text-sm font-bold uppercase border-2 border-gb-bg3 bg-gb-bg2 hover:bg-gb-bg3 text-gb-fg transition-colors"
          >
            <RotateCcw size={16} />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
