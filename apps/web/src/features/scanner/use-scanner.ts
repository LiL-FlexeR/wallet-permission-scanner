'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { normalizeAddress, type CoverageResponse } from '@wps/contracts';
import { loadCoverage, scanAddress, ScannerError } from './api-client';
import { initialScanState, scanReducer } from './state';

export function useScanner() {
  const [input, setInput] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [scan, dispatch] = useReducer(scanReducer, initialScanState);
  const [coverage, setCoverage] = useState<{
    status: 'loading' | 'success' | 'error';
    data: CoverageResponse | null;
    error: ScannerError | null;
  }>({ status: 'loading', data: null, error: null });
  const scanRequest = useRef<AbortController | null>(null);
  const coverageRequest = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const coverageSequence = useRef(0);
  const refreshedScan = useRef(0);

  const refreshCoverage = useCallback(() => {
    coverageRequest.current?.abort();
    const token = ++coverageSequence.current;
    const controller = new AbortController();
    coverageRequest.current = controller;
    return loadCoverage({ signal: controller.signal }).then(
      (data) => {
        if (coverageSequence.current === token && !controller.signal.aborted)
          setCoverage({ status: 'success', data, error: null });
      },
      (error: unknown) => {
        if (coverageSequence.current === token && !controller.signal.aborted)
          setCoverage({
            status: 'error',
            data: null,
            error: asScannerError(error),
          });
      },
    );
  }, []);

  useEffect(() => {
    void refreshCoverage();
    return () => {
      scanRequest.current?.abort();
      coverageRequest.current?.abort();
    };
  }, [refreshCoverage]);

  useEffect(() => {
    const result = scan.result;
    const current = coverage.data;
    if (
      result &&
      current &&
      refreshedScan.current !== scan.token &&
      (result.registryVersion !== current.registryVersion ||
        result.riskPolicyVersion !== current.riskPolicyVersion ||
        result.source !== current.source)
    ) {
      refreshedScan.current = scan.token;
      void refreshCoverage();
    }
  }, [scan.result, scan.token, coverage.data, refreshCoverage]);

  function submit() {
    if (Date.now() < scan.retryAt) return;
    let address: string;
    try {
      address = normalizeAddress(input);
    } catch {
      setValidation(
        'Enter a nonzero 0x address with 40 hexadecimal characters and a valid mixed-case checksum. ENS names are not supported.',
      );
      return false;
    }
    if (
      scanRequest.current &&
      scan.status === 'loading' &&
      scan.submittedAddress === address
    )
      return;
    setValidation(null);
    scanRequest.current?.abort();
    const token = ++sequence.current;
    const controller = new AbortController();
    scanRequest.current = controller;
    dispatch({ type: 'start', token, address });
    void scanAddress(address, { signal: controller.signal }).then(
      (result) => {
        if (sequence.current === token && !controller.signal.aborted)
          dispatch({ type: 'success', token, result });
      },
      (error: unknown) => {
        if (sequence.current === token && !controller.signal.aborted)
          dispatch({ type: 'error', token, error: asScannerError(error) });
      },
    );
    return true;
  }

  function cancel() {
    scanRequest.current?.abort();
    dispatch({ type: 'cancel', token: scan.token });
    sequence.current++;
  }
  return {
    input,
    validation,
    scan,
    coverage,
    submit,
    cancel,
    refreshCoverage() {
      setCoverage((previous) => ({
        status: 'loading',
        data: previous.data,
        error: null,
      }));
      return refreshCoverage();
    },
    edit(value: string) {
      setInput(value);
      setValidation(null);
    },
  };
}

function asScannerError(error: unknown) {
  return error instanceof ScannerError
    ? error
    : new ScannerError(
        'NETWORK',
        'The request could not be completed. Try again.',
      );
}
