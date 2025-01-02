import { useState, useEffect } from 'react';
import { instruments as instrumentsApi } from '../services/api';
import { Instrument } from '../types/api';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

const CACHE_KEY = 'cached_instruments';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface CachedData {
  instruments: Instrument[];
  timestamp: number;
}

export const useInstruments = () => {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    const loadInstruments = async () => {
      try {
        console.log('Starting to load instruments...');
        console.log('Auth state:', { isAuthenticated });
        
        if (!isAuthenticated) {
          console.log('User is not authenticated');
          setError('Please log in to load instruments');
          return;
        }
        
        setLoading(true);
        setError(null);

        // Check auth status
        const jwtToken = localStorage.getItem('jwt_token');
        const kiteToken = localStorage.getItem('kite_access_token');
        const lastLogin = localStorage.getItem('last_login');
        
        console.log('Auth status:', {
          hasJwtToken: !!jwtToken,
          jwtTokenPrefix: jwtToken ? jwtToken.substring(0, 10) + '...' : null,
          hasKiteToken: !!kiteToken,
          kiteTokenPrefix: kiteToken ? kiteToken.substring(0, 10) + '...' : null,
          lastLogin
        });

        if (!jwtToken || !kiteToken) {
          console.error('Missing required tokens');
          setError('Please log in again');
          return;
        }

        // Try to load from cache first
        console.log('Checking cache...');
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          console.log('Found cached data');
          const { instruments: cachedInstruments, timestamp }: CachedData = JSON.parse(cachedData);
          const cacheAge = Date.now() - timestamp;
          console.log('Cache age:', cacheAge / (1000 * 60 * 60), 'hours');
          
          if (cacheAge < CACHE_EXPIRY) {
            console.log('Using cached instruments:', cachedInstruments.length);
            setInstruments(cachedInstruments);
            return;
          }
          console.log('Cache expired, fetching fresh data');
        } else {
          console.log('No cached data found');
        }

        // If cache is invalid or expired, fetch fresh data
        console.log('Fetching instruments from API...');
        const fetchedInstruments = await instrumentsApi.getAll();
        console.log('Received instruments:', fetchedInstruments.length);
        
        // Process instruments
        console.log('Processing instruments...');
        const processedInstruments = fetchedInstruments.map((instrument: Instrument) => ({
          ...instrument,
          displayName: `${instrument.tradingsymbol} (${instrument.name || instrument.tradingsymbol})`
        }));
        console.log('Processed instruments:', processedInstruments.length);

        // Update cache
        console.log('Updating cache...');
        const cacheData: CachedData = {
          instruments: processedInstruments,
          timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        console.log('Cache updated');

        setInstruments(processedInstruments);
        console.log('State updated with new instruments');
      } catch (error) {
        console.error('Error loading instruments:', error);
        
        // Try to use cached data even if expired
        console.log('Attempting to use cached data after error...');
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          console.log('Found cached data to use as fallback');
          const { instruments: cachedInstruments }: CachedData = JSON.parse(cachedData);
          setInstruments(cachedInstruments);
          setError('Using cached data - Unable to fetch latest instruments');
        } else {
          console.log('No cached data available for fallback');
          setError('Failed to load instruments');
        }
      } finally {
        setLoading(false);
        console.log('Instrument loading completed');
      }
    };

    loadInstruments();
  }, [isAuthenticated]);

  return { instruments, loading, error };
};

export default useInstruments; 