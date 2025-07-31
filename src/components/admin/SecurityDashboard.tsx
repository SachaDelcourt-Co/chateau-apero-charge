import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Eye,
  Lock,
  Server,
  Database,
  Globe
} from 'lucide-react';

interface SecurityStatus {
  overall: 'secure' | 'warning' | 'critical';
  score: number;
  lastCheck: string;
  checks: {
    credentialExposure: SecurityCheck;
    environmentConfig: SecurityCheck;
    apiSecurity: SecurityCheck;
    databaseSecurity: SecurityCheck;
    networkSecurity: SecurityCheck;
    productionReadiness: SecurityCheck;
  };
}

interface SecurityCheck {
  status: 'pass' | 'warning' | 'fail';
  score: number;
  message: string;
  details: string[];
  lastUpdated: string;
}

interface SecurityEvent {
  id: string;
  type: 'security_violation' | 'failed_login' | 'suspicious_activity' | 'system_alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  source: string;
  resolved: boolean;
}

const SecurityDashboard: React.FC = () => {
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Mock data for demonstration - in real implementation, this would fetch from API
  useEffect(() => {
    loadSecurityData();
  }, []);

  const loadSecurityData = async () => {
    setIsLoading(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock security status data
    const mockStatus: SecurityStatus = {
      overall: 'secure',
      score: 92,
      lastCheck: new Date().toISOString(),
      checks: {
        credentialExposure: {
          status: 'pass',
          score: 100,
          message: 'No hardcoded credentials detected',
          details: [
            'Supabase client uses environment variables',
            'No vulnerable credentials from audit found',
            'Load testing scripts are clean',
            'Build artifacts are secure'
          ],
          lastUpdated: new Date().toISOString()
        },
        environmentConfig: {
          status: 'pass',
          score: 95,
          message: 'Environment configuration is secure',
          details: [
            'All required environment variables present',
            'Security patterns validated',
            'Production settings configured',
            'Debug mode disabled in production'
          ],
          lastUpdated: new Date().toISOString()
        },
        apiSecurity: {
          status: 'warning',
          score: 85,
          message: 'API security mostly configured',
          details: [
            'Rate limiting implemented',
            'Input validation active',
            'CORS policies configured',
            'Some security headers missing'
          ],
          lastUpdated: new Date().toISOString()
        },
        databaseSecurity: {
          status: 'pass',
          score: 90,
          message: 'Database security is good',
          details: [
            'Row Level Security enabled',
            'Connection uses environment variables',
            'Audit logging configured',
            'Connection limits set'
          ],
          lastUpdated: new Date().toISOString()
        },
        networkSecurity: {
          status: 'pass',
          score: 88,
          message: 'Network security configured',
          details: [
            'HTTPS enforced',
            'Security headers configured',
            'CSP policies active',
            'HSTS enabled'
          ],
          lastUpdated: new Date().toISOString()
        },
        productionReadiness: {
          status: 'pass',
          score: 94,
          message: 'Ready for production deployment',
          details: [
            'Build configuration secure',
            'Environment variables validated',
            'Security tests passing',
            'Monitoring configured'
          ],
          lastUpdated: new Date().toISOString()
        }
      }
    };

    // Mock security events
    const mockEvents: SecurityEvent[] = [
      {
        id: '1',
        type: 'system_alert',
        severity: 'low',
        message: 'Security verification completed successfully',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        source: 'Security Verification Script',
        resolved: true
      },
      {
        id: '2',
        type: 'security_violation',
        severity: 'medium',
        message: 'Rate limit exceeded for IP 192.168.1.100',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        source: 'API Security Middleware',
        resolved: true
      },
      {
        id: '3',
        type: 'system_alert',
        severity: 'low',
        message: 'Production readiness check passed',
        timestamp: new Date(Date.now() - 900000).toISOString(),
        source: 'Production Readiness Check',
        resolved: true
      }
    ];

    setSecurityStatus(mockStatus);
    setSecurityEvents(mockEvents);
    setIsLoading(false);
    setLastRefresh(new Date());
  };

  const runSecurityCheck = async (checkType: string) => {
    setIsLoading(true);
    
    // Simulate running security check
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Refresh data after check
    await loadSecurityData();
  };

  const getStatusIcon = (status: 'pass' | 'warning' | 'fail') => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'warning' | 'fail') => {
    switch (status) {
      case 'pass':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'fail':
        return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  const getSeverityColor = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    switch (severity) {
      case 'low':
        return 'bg-blue-100 text-blue-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
    }
  };

  if (isLoading && !securityStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-lg">Loading security dashboard...</span>
      </div>
    );
  }

  if (!securityStatus) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load security status. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor security status and verification results
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button 
            onClick={() => loadSecurityData()} 
            disabled={isLoading}
            size="sm"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Security Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-6 w-6" />
            <span>Overall Security Status</span>
          </CardTitle>
          <CardDescription>
            Comprehensive security assessment based on all verification checks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              {securityStatus.overall === 'secure' ? (
                <ShieldCheck className="h-12 w-12 text-green-500" />
              ) : securityStatus.overall === 'warning' ? (
                <ShieldAlert className="h-12 w-12 text-yellow-500" />
              ) : (
                <ShieldAlert className="h-12 w-12 text-red-500" />
              )}
              <div>
                <h3 className="text-2xl font-bold">
                  {securityStatus.overall === 'secure' ? 'Secure' : 
                   securityStatus.overall === 'warning' ? 'Needs Attention' : 'Critical Issues'}
                </h3>
                <p className="text-muted-foreground">Security Score: {securityStatus.score}/100</p>
              </div>
            </div>
            <div className="text-right">
              <Progress value={securityStatus.score} className="w-32 mb-2" />
              <p className="text-sm text-muted-foreground">
                Last check: {new Date(securityStatus.lastCheck).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Checks Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="checks">Security Checks</TabsTrigger>
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="actions">Quick Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(securityStatus.checks).map(([key, check]) => (
              <Card key={key}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    {getStatusIcon(check.status)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Badge className={getStatusColor(check.status)}>
                      {check.status.toUpperCase()}
                    </Badge>
                    <p className="text-sm text-muted-foreground">{check.message}</p>
                    <Progress value={check.score} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      Score: {check.score}/100
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="checks" className="space-y-4">
          {Object.entries(securityStatus.checks).map(([key, check]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(check.status)}>
                      {check.status.toUpperCase()}
                    </Badge>
                    {getStatusIcon(check.status)}
                  </div>
                </CardTitle>
                <CardDescription>{check.message}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Security Score</span>
                    <span className="text-sm">{check.score}/100</span>
                  </div>
                  <Progress value={check.score} />
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Check Details:</h4>
                    <ul className="space-y-1">
                      {check.details.map((detail, index) => (
                        <li key={index} className="text-sm text-muted-foreground flex items-center">
                          <CheckCircle className="h-3 w-3 text-green-500 mr-2 flex-shrink-0" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      Last updated: {new Date(check.lastUpdated).toLocaleString()}
                    </span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => runSecurityCheck(key)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Eye className="h-3 w-3 mr-1" />
                      )}
                      Re-check
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Security Events</CardTitle>
              <CardDescription>
                Monitor security violations, alerts, and system events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {securityEvents.map((event) => (
                  <div key={event.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <div className="flex-shrink-0">
                      {event.type === 'security_violation' && <ShieldAlert className="h-5 w-5 text-red-500" />}
                      {event.type === 'failed_login' && <Lock className="h-5 w-5 text-orange-500" />}
                      {event.type === 'suspicious_activity' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                      {event.type === 'system_alert' && <Shield className="h-5 w-5 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{event.message}</p>
                        <Badge className={getSeverityColor(event.severity)}>
                          {event.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-muted-foreground">
                          {event.source} • {new Date(event.timestamp).toLocaleString()}
                        </p>
                        {event.resolved && (
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            Resolved
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <span>Security Verification</span>
                </CardTitle>
                <CardDescription>
                  Run comprehensive security checks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  className="w-full" 
                  onClick={() => runSecurityCheck('credential-exposure')}
                  disabled={isLoading}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Verify Credential Security
                </Button>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => runSecurityCheck('environment')}
                  disabled={isLoading}
                >
                  <Server className="h-4 w-4 mr-2" />
                  Check Environment Config
                </Button>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => runSecurityCheck('production-readiness')}
                  disabled={isLoading}
                >
                  <Globe className="h-4 w-4 mr-2" />
                  Production Readiness Check
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Database className="h-5 w-5" />
                  <span>System Health</span>
                </CardTitle>
                <CardDescription>
                  Monitor system security status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-green-50 rounded border">
                    <div className="font-medium text-green-800">API Security</div>
                    <div className="text-green-600">Active</div>
                  </div>
                  <div className="p-2 bg-green-50 rounded border">
                    <div className="font-medium text-green-800">Rate Limiting</div>
                    <div className="text-green-600">Enabled</div>
                  </div>
                  <div className="p-2 bg-green-50 rounded border">
                    <div className="font-medium text-green-800">HTTPS</div>
                    <div className="text-green-600">Enforced</div>
                  </div>
                  <div className="p-2 bg-green-50 rounded border">
                    <div className="font-medium text-green-800">Monitoring</div>
                    <div className="text-green-600">Active</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SecurityDashboard;