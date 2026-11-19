import type { ScanSuccess } from '@wps/contracts';
import type { ScannerError } from './api-client';

export type ScanState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  token: number;
  submittedAddress: string | null;
  result: ScanSuccess | null;
  error: ScannerError | null;
  retryAt: number;
};
export const initialScanState: ScanState = {
  status: 'idle',
  token: 0,
  submittedAddress: null,
  result: null,
  error: null,
  retryAt: 0,
};
type Action =
  | { type: 'start'; token: number; address: string }
  | { type: 'success'; token: number; result: ScanSuccess }
  | { type: 'error'; token: number; error: ScannerError }
  | { type: 'cancel'; token: number };

export function scanReducer(state: ScanState, action: Action): ScanState {
  if (action.type === 'start') {
    if (action.token <= state.token) return state;
    return {
      ...initialScanState,
      status: 'loading',
      token: action.token,
      submittedAddress: action.address,
    };
  }
  if (state.status !== 'loading' || action.token !== state.token) return state;
  if (action.type === 'cancel')
    return { ...initialScanState, token: state.token };
  if (action.type === 'success') {
    if (action.result.walletAddress !== state.submittedAddress) return state;
    return { ...state, status: 'success', result: action.result };
  }
  return {
    ...state,
    status: 'error',
    error: action.error,
    retryAt: action.error.retryAt,
  };
}
