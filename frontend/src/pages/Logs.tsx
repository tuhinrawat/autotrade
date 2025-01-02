import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Tab,
  Tabs,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`log-tabpanel-${index}`}
      aria-labelledby={`log-tab-${index}`}
      {...other}
      style={{ height: '100%' }}
    >
      {value === index && (
        <Box sx={{ height: '100%', p: 0 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const Logs = () => {
  const [currentTab, setCurrentTab] = useState(0);
  const [backendLogs, setBackendLogs] = useState<string[]>([]);
  const [frontendLogs, setFrontendLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/logs');
        if (response.ok) {
          const reader = response.body?.getReader();
          if (!reader) return;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = new TextDecoder().decode(value);
            const lines = text.split('\n').filter(line => line.trim());
            
            lines.forEach(line => {
              try {
                const logData = JSON.parse(line);
                if (logData.source === 'backend') {
                  setBackendLogs(prev => [...prev, logData.message]);
                } else if (logData.source === 'frontend') {
                  setFrontendLogs(prev => [...prev, logData.message]);
                }
              } catch (e) {
                // Handle non-JSON log lines
                setBackendLogs(prev => [...prev, line]);
              }
            });

            if (!isPaused && logContainerRef.current) {
              logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
      }
    };

    fetchLogs();
  }, [isPaused]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const clearLogs = () => {
    if (currentTab === 0) {
      setBackendLogs([]);
    } else {
      setFrontendLogs([]);
    }
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const LogDisplay = ({ logs }: { logs: string[] }) => (
    <Box
      ref={logContainerRef}
      sx={{
        height: 'calc(100vh - 250px)',
        overflowY: 'auto',
        bgcolor: '#1a1a1a',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: '0.9rem',
        p: 2,
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: '#2a2a2a',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#555',
          borderRadius: '4px',
        },
      }}
    >
      {logs.map((log, index) => (
        <Box
          key={index}
          sx={{
            py: 0.5,
            borderBottom: '1px solid #333',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {log}
        </Box>
      ))}
    </Box>
  );

  return (
    <Container maxWidth={false}>
      <Box sx={{ width: '100%', mt: 2 }}>
        <Paper sx={{ width: '100%', mb: 2 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
            <Tabs value={currentTab} onChange={handleTabChange}>
              <Tab label="Backend Logs" />
              <Tab label="Frontend Logs" />
            </Tabs>
            <Box sx={{ flexGrow: 1 }} />
            <Box sx={{ pr: 2 }}>
              <Tooltip title={isPaused ? "Resume auto-scroll" : "Pause auto-scroll"}>
                <IconButton onClick={togglePause} size="small">
                  {isPaused ? <PlayArrowIcon /> : <PauseIcon />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear logs">
                <IconButton onClick={clearLogs} size="small">
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          <TabPanel value={currentTab} index={0}>
            <LogDisplay logs={backendLogs} />
          </TabPanel>
          <TabPanel value={currentTab} index={1}>
            <LogDisplay logs={frontendLogs} />
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
};

export default Logs; 