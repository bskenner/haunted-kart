import { ErrorBoundary } from '@/components/error-boundary';
import HauntedKart from '@/game/HauntedKart';

function App() {
  return (
    <ErrorBoundary>
      <HauntedKart />
    </ErrorBoundary>
  );
}

export default App;
