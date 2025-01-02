import React, { useState, useCallback, useEffect } from 'react';
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Popper,
  styled
} from '@mui/material';
import { Instrument } from '../types/api';
import _ from 'lodash';

const StyledPopper = styled(Popper)({
  '& .MuiAutocomplete-listbox': {
    '& .MuiAutocomplete-option': {
      padding: '8px 16px',
      '&:hover': {
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
      },
    },
  },
});

interface InstrumentSearchProps {
  value: Instrument | null;
  onChange: (value: Instrument | null) => void;
  instruments: Instrument[];
  loading: boolean;
}

const InstrumentSearch: React.FC<InstrumentSearchProps> = ({
  value,
  onChange,
  instruments,
  loading
}) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [filteredOptions, setFilteredOptions] = useState<Instrument[]>([]);
  const [localLoading, setLocalLoading] = useState(false);

  // Debug logging for props and state
  useEffect(() => {
    console.log('InstrumentSearch state:', {
      hasValue: !!value,
      instrumentsCount: instruments.length,
      loading,
      localLoading,
      open,
      filteredCount: filteredOptions.length,
      inputValue
    });
  }, [value, instruments, loading, localLoading, open, filteredOptions, inputValue]);

  const filterOptions = useCallback(
    _.debounce((input: string) => {
      console.log('Filtering options with input:', input);
      setLocalLoading(true);
      
      try {
        if (!input) {
          console.log('Empty input, clearing filtered options');
          setFilteredOptions([]);
          return;
        }

        const searchTerms = input.toLowerCase().split(/\s+/);
        console.log('Search terms:', searchTerms);
        
        const filtered = instruments
          .filter(instrument => {
            const searchString = `${instrument.tradingsymbol} ${instrument.name || ''} ${instrument.exchange}`.toLowerCase();
            return searchTerms.every(term => searchString.includes(term));
          })
          .slice(0, 100); // Limit to first 100 matches

        console.log(`Found ${filtered.length} matches`);
        setFilteredOptions(filtered);
      } catch (error) {
        console.error('Error filtering options:', error);
        setFilteredOptions([]);
      } finally {
        setLocalLoading(false);
      }
    }, 300),
    [instruments]
  );

  const handleInputChange = (
    _event: React.SyntheticEvent,
    newInputValue: string
  ) => {
    console.log('Input changed:', newInputValue);
    setInputValue(newInputValue);
    filterOptions(newInputValue);
  };

  return (
    <Autocomplete
      value={value}
      onChange={(_, newValue) => {
        console.log('Selection changed:', newValue);
        onChange(newValue);
      }}
      onInputChange={handleInputChange}
      open={open}
      onOpen={() => {
        console.log('Dropdown opened');
        setOpen(true);
      }}
      onClose={() => {
        console.log('Dropdown closed');
        setOpen(false);
      }}
      options={filteredOptions}
      loading={loading || localLoading}
      PopperComponent={StyledPopper}
      getOptionLabel={(option) => option.tradingsymbol}
      isOptionEqualToValue={(option, value) => 
        option.tradingsymbol === value.tradingsymbol && 
        option.exchange === value.exchange
      }
      filterOptions={(x) => x} // Disable built-in filtering
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search Instruments"
          required
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {(loading || localLoading) ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
          helperText={loading ? 'Loading instruments...' : 'Type to search instruments'}
        />
      )}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={`${option.tradingsymbol}-${option.exchange}`}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body1" component="div" sx={{ fontWeight: 'bold' }}>
              {option.tradingsymbol}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              {option.name || option.tradingsymbol} • {option.exchange}
            </Typography>
          </Box>
        </Box>
      )}
      ListboxProps={{
        style: {
          maxHeight: '400px'
        }
      }}
      noOptionsText={inputValue ? 'No matching instruments' : 'Type to search instruments'}
    />
  );
};

export default InstrumentSearch; 