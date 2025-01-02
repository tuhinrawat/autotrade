import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { Instrument } from '../types/api';
import InstrumentSearch from './InstrumentSearch';
import useInstruments from '../hooks/useInstruments';
import { Alert, CircularProgress, Box } from '@mui/material';

interface InstrumentSearchWrapperProps {
  value: Instrument | null;
  onChange: (value: Instrument | null) => void;
}

const InstrumentSearchWrapper: React.FC<InstrumentSearchWrapperProps> = ({
  value,
  onChange
}) => {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { instruments, loading, error } = useInstruments();

  if (!isAuthenticated) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Please log in to search instruments
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={2}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <InstrumentSearch
        value={value}
        onChange={onChange}
        instruments={instruments}
        loading={loading}
      />
    </>
  );
};

export default InstrumentSearchWrapper; 