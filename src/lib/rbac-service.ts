/**
 * Enhanced Role-Based Access Control (RBAC) Service
 * 
 * Provides comprehensive RBAC functionality including:
 * - Hierarchical role management
 * - Fine-grained permission system
 * - Resource-based access control
 * - Dynamic permission evaluation
 * - Role inheritance and delegation
 * - Audit logging for authorization events
 */

import { auditLogger, AuditResult } from './audit-logger';
import { SecurityConfig } from '../config/security';

// Enhanced role definitions
export interface Role {
  id: string;
  name: string;
  description: string;
  level: number; // Hierarchy level (higher = more privileged)
  permissions: Permission[];
  inheritsFrom?: string[]; // Parent roles
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Permission definition
export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  conditions?: PermissionCondition[];
  isActive: boolean;
}

// Permission conditions for dynamic evaluation
export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
  context?: 'user' | 'resource' | 'environment';
}

// User role assignment
export interface UserRole {
  userId: string;
  roleId: string;
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  context?: Record<string, any>; // Additional context for role assignment
}

// Access control context
export interface AccessContext {
  userId: string;
  resource: string;
  action: string;
  resourceId?: string;
  environment?: Record<string, any>;
  timestamp: Date;
}

// Authorization result
export interface AuthorizationResult {
  granted: boolean;
  reason: string;
  matchedPermissions: Permission[];
  deniedPermissions: Permission[];
  effectiveRoles: Role[];
}

/**
 * Enhanced RBAC Service
 */
export class RBACService {
  private static instance: RBACService;
  private roles = new Map<string, Role>();
  private permissions = new Map<string, Permission>();
  private userRoles = new Map<string, UserRole[]>();

  private constructor() {
    this.initializeDefaultRoles();
  }

  public static getInstance(): RBACService {
    if (!RBACService.instance) {
      RBACService.instance = new RBACService();
    }
    return RBACService.instance;
  }

  /**
   * Initialize default roles and permissions
   */
  private initializeDefaultRoles(): void {
    // Define default permissions
    const permissions: Permission[] = [
      // Authentication permissions
      {
        id: 'auth.login',
        name: 'Login',
        description: 'Can authenticate to the system',
        resource: 'authentication',
        action: 'login',
        isActive: true,
      },
      {
        id: 'auth.logout',
        name: 'Logout',
        description: 'Can logout from the system',
        resource: 'authentication',
        action: 'logout',
        isActive: true,
      },

      // Bar operations
      {
        id: 'bar.view',
        name: 'View Bar',
        description: 'Can view bar interface',
        resource: 'bar',
        action: 'view',
        isActive: true,
      },
      {
        id: 'bar.process_orders',
        name: 'Process Orders',
        description: 'Can process bar orders',
        resource: 'bar',
        action: 'process_orders',
        isActive: true,
      },
      {
        id: 'bar.view_transactions',
        name: 'View Transactions',
        description: 'Can view bar transactions',
        resource: 'bar',
        action: 'view_transactions',
        isActive: true,
      },

      // Recharge operations
      {
        id: 'recharge.view',
        name: 'View Recharge',
        description: 'Can view recharge interface',
        resource: 'recharge',
        action: 'view',
        isActive: true,
      },
      {
        id: 'recharge.process',
        name: 'Process Recharge',
        description: 'Can process card recharges',
        resource: 'recharge',
        action: 'process',
        isActive: true,
      },

      // Admin operations
      {
        id: 'admin.view',
        name: 'View Admin',
        description: 'Can view admin interface',
        resource: 'admin',
        action: 'view',
        isActive: true,
      },
      {
        id: 'admin.manage_users',
        name: 'Manage Users',
        description: 'Can create and manage users',
        resource: 'admin',
        action: 'manage_users',
        isActive: true,
      },
      {
        id: 'admin.view_statistics',
        name: 'View Statistics',
        description: 'Can view system statistics',
        resource: 'admin',
        action: 'view_statistics',
        isActive: true,
      },
      {
        id: 'admin.manage_refunds',
        name: 'Manage Refunds',
        description: 'Can process refunds',
        resource: 'admin',
        action: 'manage_refunds',
        conditions: [
          {
            field: 'amount',
            operator: 'less_than',
            value: 1000,
            context: 'resource',
          }
        ],
        isActive: true,
      },
      {
        id: 'admin.system_config',
        name: 'System Configuration',
        description: 'Can modify system configuration',
        resource: 'admin',
        action: 'system_config',
        isActive: true,
      },

      // Audit and monitoring
      {
        id: 'audit.view',
        name: 'View Audit Logs',
        description: 'Can view audit logs',
        resource: 'audit',
        action: 'view',
        isActive: true,
      },
      {
        id: 'monitoring.view',
        name: 'View Monitoring',
        description: 'Can view system monitoring',
        resource: 'monitoring',
        action: 'view',
        isActive: true,
      },
    ];

    // Store permissions
    permissions.forEach(permission => {
      this.permissions.set(permission.id, permission);
    });

    // Define default roles
    const roles: Role[] = [
      {
        id: 'bar',
        name: 'Bar Staff',
        description: 'Bar staff with order processing capabilities',
        level: 1,
        permissions: [
          this.permissions.get('auth.login')!,
          this.permissions.get('auth.logout')!,
          this.permissions.get('bar.view')!,
          this.permissions.get('bar.process_orders')!,
          this.permissions.get('bar.view_transactions')!,
        ],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'recharge',
        name: 'Recharge Staff',
        description: 'Staff responsible for card recharges',
        level: 1,
        permissions: [
          this.permissions.get('auth.login')!,
          this.permissions.get('auth.logout')!,
          this.permissions.get('recharge.view')!,
          this.permissions.get('recharge.process')!,
        ],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Full system administrator',
        level: 3,
        permissions: Array.from(this.permissions.values()),
        inheritsFrom: ['bar', 'recharge'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'super_admin',
        name: 'Super Administrator',
        description: 'Super administrator with all privileges',
        level: 4,
        permissions: Array.from(this.permissions.values()),
        inheritsFrom: ['admin'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Store roles
    roles.forEach(role => {
      this.roles.set(role.id, role);
    });
  }

  /**
   * Check if user has permission for specific action
   */
  async checkPermission(
    userId: string,
    resource: string,
    action: string,
    context?: AccessContext
  ): Promise<AuthorizationResult> {
    const requestId = this.generateRequestId();
    
    try {
      // Get user's effective roles
      const effectiveRoles = await this.getUserEffectiveRoles(userId);
      
      if (effectiveRoles.length === 0) {
        await this.logAuthorizationAttempt(requestId, userId, resource, action, false, 'No roles assigned');
        
        return {
          granted: false,
          reason: 'No roles assigned to user',
          matchedPermissions: [],
          deniedPermissions: [],
          effectiveRoles: [],
        };
      }

      // Collect all permissions from effective roles
      const allPermissions = new Set<Permission>();
      effectiveRoles.forEach(role => {
        role.permissions.forEach(permission => {
          if (permission.isActive) {
            allPermissions.add(permission);
          }
        });
      });

      // Find matching permissions
      const matchedPermissions: Permission[] = [];
      const deniedPermissions: Permission[] = [];

      for (const permission of allPermissions) {
        if (permission.resource === resource && permission.action === action) {
          // Check permission conditions
          const conditionResult = await this.evaluatePermissionConditions(
            permission,
            context || {
              userId,
              resource,
              action,
              timestamp: new Date(),
            }
          );

          if (conditionResult.granted) {
            matchedPermissions.push(permission);
          } else {
            deniedPermissions.push(permission);
          }
        }
      }

      const granted = matchedPermissions.length > 0;
      const reason = granted 
        ? `Access granted via ${matchedPermissions.map(p => p.name).join(', ')}`
        : deniedPermissions.length > 0
          ? `Access denied due to condition failures`
          : `No matching permissions found`;

      await this.logAuthorizationAttempt(requestId, userId, resource, action, granted, reason);

      return {
        granted,
        reason,
        matchedPermissions,
        deniedPermissions,
        effectiveRoles,
      };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        userId,
        action: 'permission_check',
        resource: 'rbac_service',
        error,
      });

      return {
        granted: false,
        reason: 'Authorization check failed',
        matchedPermissions: [],
        deniedPermissions: [],
        effectiveRoles: [],
      };
    }
  }

  /**
   * Get user's effective roles (including inherited roles)
   */
  async getUserEffectiveRoles(userId: string): Promise<Role[]> {
    const userRoleAssignments = this.userRoles.get(userId) || [];
    const effectiveRoles = new Set<Role>();

    // Process direct role assignments
    for (const assignment of userRoleAssignments) {
      if (!assignment.isActive) continue;
      
      // Check if assignment has expired
      if (assignment.expiresAt && assignment.expiresAt < new Date()) {
        assignment.isActive = false;
        continue;
      }

      const role = this.roles.get(assignment.roleId);
      if (role && role.isActive) {
        effectiveRoles.add(role);
        
        // Add inherited roles
        await this.addInheritedRoles(role, effectiveRoles);
      }
    }

    return Array.from(effectiveRoles);
  }

  /**
   * Add inherited roles recursively
   */
  private async addInheritedRoles(role: Role, effectiveRoles: Set<Role>): Promise<void> {
    if (!role.inheritsFrom) return;

    for (const parentRoleId of role.inheritsFrom) {
      const parentRole = this.roles.get(parentRoleId);
      if (parentRole && parentRole.isActive && !effectiveRoles.has(parentRole)) {
        effectiveRoles.add(parentRole);
        await this.addInheritedRoles(parentRole, effectiveRoles);
      }
    }
  }

  /**
   * Evaluate permission conditions
   */
  private async evaluatePermissionConditions(
    permission: Permission,
    context: AccessContext
  ): Promise<{ granted: boolean; reason: string }> {
    if (!permission.conditions || permission.conditions.length === 0) {
      return { granted: true, reason: 'No conditions to evaluate' };
    }

    for (const condition of permission.conditions) {
      const result = await this.evaluateCondition(condition, context);
      if (!result.granted) {
        return result;
      }
    }

    return { granted: true, reason: 'All conditions satisfied' };
  }

  /**
   * Evaluate individual condition
   */
  private async evaluateCondition(
    condition: PermissionCondition,
    context: AccessContext
  ): Promise<{ granted: boolean; reason: string }> {
    let actualValue: any;

    // Get actual value based on context
    switch (condition.context) {
      case 'user':
        // Get user-specific value (would fetch from user profile)
        actualValue = await this.getUserContextValue(context.userId, condition.field);
        break;
      case 'resource':
        // Get resource-specific value (would fetch from resource data)
        actualValue = await this.getResourceContextValue(context.resource, context.resourceId, condition.field);
        break;
      case 'environment':
        // Get environment value
        actualValue = context.environment?.[condition.field];
        break;
      default:
        actualValue = context.environment?.[condition.field];
    }

    // Evaluate condition
    const granted = this.evaluateOperator(actualValue, condition.operator, condition.value);
    const reason = granted 
      ? `Condition satisfied: ${condition.field} ${condition.operator} ${condition.value}`
      : `Condition failed: ${condition.field} (${actualValue}) ${condition.operator} ${condition.value}`;

    return { granted, reason };
  }

  /**
   * Evaluate operator
   */
  private evaluateOperator(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'greater_than':
        return Number(actual) > Number(expected);
      case 'less_than':
        return Number(actual) < Number(expected);
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        return false;
    }
  }

  /**
   * Get user context value
   */
  private async getUserContextValue(userId: string, field: string): Promise<any> {
    // In production, this would fetch from user profile/database
    const mockUserData: Record<string, any> = {
      department: 'bar',
      level: 1,
      experience_years: 2,
    };
    
    return mockUserData[field];
  }

  /**
   * Get resource context value
   */
  private async getResourceContextValue(resource: string, resourceId: string | undefined, field: string): Promise<any> {
    // In production, this would fetch from resource data
    const mockResourceData: Record<string, any> = {
      amount: 500,
      status: 'pending',
      priority: 'normal',
    };
    
    return mockResourceData[field];
  }

  /**
   * Assign role to user
   */
  async assignRole(
    userId: string,
    roleId: string,
    assignedBy: string,
    expiresAt?: Date
  ): Promise<{ success: boolean; message: string }> {
    const requestId = this.generateRequestId();
    
    try {
      const role = this.roles.get(roleId);
      if (!role) {
        return { success: false, message: 'Role not found' };
      }

      const userRoleAssignments = this.userRoles.get(userId) || [];
      
      // Check if role is already assigned
      const existingAssignment = userRoleAssignments.find(
        assignment => assignment.roleId === roleId && assignment.isActive
      );

      if (existingAssignment) {
        return { success: false, message: 'Role already assigned to user' };
      }

      // Create new role assignment
      const assignment: UserRole = {
        userId,
        roleId,
        assignedBy,
        assignedAt: new Date(),
        expiresAt,
        isActive: true,
      };

      userRoleAssignments.push(assignment);
      this.userRoles.set(userId, userRoleAssignments);

      await auditLogger.logAuthorization({
        requestId,
        userId: assignedBy,
        action: 'role_assignment',
        resource: 'user_role',
        requiredPermissions: ['admin.manage_users'],
        userPermissions: ['admin.manage_users'],
        result: AuditResult.SUCCESS,
      });

      return { success: true, message: `Role ${role.name} assigned successfully` };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        userId: assignedBy,
        action: 'role_assignment',
        resource: 'rbac_service',
        error,
      });

      return { success: false, message: 'Failed to assign role' };
    }
  }

  /**
   * Revoke role from user
   */
  async revokeRole(
    userId: string,
    roleId: string,
    revokedBy: string
  ): Promise<{ success: boolean; message: string }> {
    const requestId = this.generateRequestId();
    
    try {
      const userRoleAssignments = this.userRoles.get(userId) || [];
      const assignmentIndex = userRoleAssignments.findIndex(
        assignment => assignment.roleId === roleId && assignment.isActive
      );

      if (assignmentIndex === -1) {
        return { success: false, message: 'Role assignment not found' };
      }

      // Deactivate role assignment
      userRoleAssignments[assignmentIndex].isActive = false;
      this.userRoles.set(userId, userRoleAssignments);

      const role = this.roles.get(roleId);
      
      await auditLogger.logAuthorization({
        requestId,
        userId: revokedBy,
        action: 'role_revocation',
        resource: 'user_role',
        requiredPermissions: ['admin.manage_users'],
        userPermissions: ['admin.manage_users'],
        result: AuditResult.SUCCESS,
      });

      return { success: true, message: `Role ${role?.name || roleId} revoked successfully` };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        userId: revokedBy,
        action: 'role_revocation',
        resource: 'rbac_service',
        error,
      });

      return { success: false, message: 'Failed to revoke role' };
    }
  }

  /**
   * Get user roles and permissions
   */
  async getUserRolesAndPermissions(userId: string): Promise<{
    roles: Role[];
    permissions: Permission[];
    assignments: UserRole[];
  }> {
    const effectiveRoles = await this.getUserEffectiveRoles(userId);
    const assignments = this.userRoles.get(userId) || [];
    
    const allPermissions = new Set<Permission>();
    effectiveRoles.forEach(role => {
      role.permissions.forEach(permission => {
        if (permission.isActive) {
          allPermissions.add(permission);
        }
      });
    });

    return {
      roles: effectiveRoles,
      permissions: Array.from(allPermissions),
      assignments: assignments.filter(a => a.isActive),
    };
  }

  /**
   * Log authorization attempt
   */
  private async logAuthorizationAttempt(
    requestId: string,
    userId: string,
    resource: string,
    action: string,
    granted: boolean,
    reason: string
  ): Promise<void> {
    await auditLogger.logAuthorization({
      requestId,
      userId,
      action: `${resource}.${action}`,
      resource,
      requiredPermissions: [`${resource}.${action}`],
      userPermissions: granted ? [`${resource}.${action}`] : [],
      result: granted ? AuditResult.SUCCESS : AuditResult.FAILURE,
    });
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `rbac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all available roles
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values()).filter(role => role.isActive);
  }

  /**
   * Get all available permissions
   */
  getAllPermissions(): Permission[] {
    return Array.from(this.permissions.values()).filter(permission => permission.isActive);
  }
}

// Export singleton instance
export const rbacService = RBACService.getInstance();