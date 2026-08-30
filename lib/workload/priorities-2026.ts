export type WorkloadTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'waiting'
  | 'blocked'
  | 'pending_approval'
  | 'completed'
  | 'cancelled'

export type WorkloadTask = {
  title: string
  description: string
  assigneeEmail: string
  createdByEmail?: string
  category: 'operational' | 'technical' | 'administrative' | 'marketing' | 'finance' | 'business_development' | 'support' | 'project' | 'other'
  priority: 'low' | 'medium' | 'high'
  status: WorkloadTaskStatus
  progress: number
  startDate?: string | null
  dueDate?: string | null
  comment?: { authorEmail: string; body: string }
}

export type WorkloadMilestone = {
  title: string
  status: 'planned' | 'active' | 'completed'
  startDate?: string | null
  dueDate?: string | null
  tasks: WorkloadTask[]
}

export type WorkloadProject = {
  title: string
  description: string
  ownerEmail: string
  departmentSlug: string
  teamEmails: string[]
  status: 'active' | 'paused' | 'completed' | 'archived'
  milestones: WorkloadMilestone[]
}

export type WorkloadResponsibility = {
  title: string
  description: string
  ownerEmail: string
  departmentSlug: string
  category: string
  assigneeEmails: string[]
}

/** August 2026 MD pack, plus Victor’s four named workstreams. */
export const PRIORITY_RESPONSIBILITIES: WorkloadResponsibility[] = [
  {
    title: 'Digital Technology delivery',
    description: 'Own internal systems, client builds, and reporting tools for GCS — WorkHub, Tender Watch, and active client implementations.',
    ownerEmail: 'victor@globeconcs.com',
    departmentSlug: 'technology',
    category: 'technical',
    assigneeEmails: ['victor@globeconcs.com', 'velma@globeconcs.com', 'krystal.markk@gmail.com'],
  },
  {
    title: 'Digital product and website quality',
    description: 'Co-lead client systems QA, Globecon web presence, ODK forms, and chatbot/WhatsApp channels.',
    ownerEmail: 'velma@globeconcs.com',
    departmentSlug: 'technology',
    category: 'technical',
    assigneeEmails: ['velma@globeconcs.com', 'calvin@globeoncs.com'],
  },
  {
    title: 'Business development pipeline',
    description: 'Run live proposals, EOIs, and joint ventures through submission and follow-up.',
    ownerEmail: 'patrick@globeconcs.com',
    departmentSlug: 'operations',
    category: 'business_development',
    assigneeEmails: ['patrick@globeconcs.com'],
  },
]

export const PRIORITY_PROJECTS: WorkloadProject[] = [
  {
    title: 'Kalimoni Church Management System',
    description: 'Development of a church management system for Kalimoni, including the live website build that now follows the design phase.',
    ownerEmail: 'victor@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['victor@globeconcs.com', 'krystal.markk@gmail.com', 'calvin@globeoncs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Church management system',
        status: 'completed',
        startDate: '2026-07-01',
        dueDate: '2026-08-21',
        tasks: [
          {
            title: 'Kalimoni church management system — QA',
            description: 'Quality assurance on the church management system. Issues logged to Jira for Daniel. Awaiting his feedback before close-out.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'waiting',
            progress: 100,
            startDate: '2026-07-15',
            dueDate: '2026-08-21',
            comment: {
              authorEmail: 'krystal.markk@gmail.com',
              body: 'QA is done and Jira tickets are with Daniel. Holding for his response.',
            },
          },
        ],
      },
      {
        title: 'Website — first implementation phase',
        status: 'active',
        startDate: '2026-08-01',
        dueDate: '2026-08-21',
        tasks: [
          {
            title: 'Kalimoni website — implement online presence',
            description: 'Moved from design into active implementation of the Kalimoni website. Supporting: Mark Krystal.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'project',
            priority: 'high',
            status: 'in_progress',
            progress: 50,
            startDate: '2026-08-01',
            dueDate: '2026-08-21',
          },
          {
            title: 'Kalimoni — web and social content pack',
            description: 'Collecting and compiling information for web design and social media strategy.',
            assigneeEmail: 'calvin@globeoncs.com',
            category: 'marketing',
            priority: 'medium',
            status: 'in_progress',
            progress: 28,
            startDate: '2026-08-01',
            dueDate: '2026-08-31',
          },
        ],
      },
    ],
  },
  {
    title: 'GCS WorkHub',
    description: 'A central company reporting system for departmental workflows, individual deliverables, and on-time execution — the GCS Watcher/Tracker now running as WorkHub.',
    ownerEmail: 'victor@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['victor@globeconcs.com', 'velma@globeconcs.com', 'krystal.markk@gmail.com'],
    status: 'active',
    milestones: [
      {
        title: 'First visual / reporting phase',
        status: 'active',
        startDate: '2026-08-01',
        dueDate: '2026-08-24',
        tasks: [
          {
            title: 'WorkHub — central reporting workspace',
            description: 'Engineer a centralized tracking system for departmental workflows and individual deliverables. First visual phase is in progress.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'in_progress',
            progress: 20,
            startDate: '2026-08-01',
            dueDate: '2026-08-24',
          },
          {
            title: 'Quarterly system report documentation',
            description: 'Update the quarterly system report pack. Supporting: Maurice Wagura.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'administrative',
            priority: 'medium',
            status: 'in_progress',
            progress: 50,
            startDate: '2026-08-01',
            dueDate: '2026-08-19',
          },
        ],
      },
    ],
  },
  {
    title: 'GCS Tender Watch',
    description: 'System for checking new tenders and job opportunities, including a crawler for sources the current watch misses and AI matching/classification.',
    ownerEmail: 'victor@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['victor@globeconcs.com', 'velma@globeconcs.com', 'patrick@globeconcs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Crawler and live watch',
        status: 'active',
        startDate: '2026-07-15',
        dueDate: '2026-08-13',
        tasks: [
          {
            title: 'Tender Watch — online crawler for missing tenders',
            description: 'Build an online crawling tool to pick up tenders that do not appear on the current system.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'in_progress',
            progress: 90,
            startDate: '2026-07-15',
            dueDate: '2026-08-13',
          },
        ],
      },
      {
        title: 'AI matching and classification',
        status: 'active',
        startDate: '2026-08-11',
        dueDate: '2026-09-04',
        tasks: [
          {
            title: 'Tender Watch — AI matching workflow',
            description: 'AI workflow for matching and classifying tenders discovered by the crawler.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'in_progress',
            progress: 20,
            startDate: '2026-08-11',
            dueDate: '2026-09-04',
          },
        ],
      },
    ],
  },
  {
    title: 'Hewane School of Music',
    description: 'A full website revamp for Hewane School of Music — discovery through design, build, and launch.',
    ownerEmail: 'victor@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['victor@globeconcs.com', 'krystal.markk@gmail.com', 'calvin@globeoncs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Discovery and rebuild',
        status: 'active',
        startDate: '2026-08-25',
        dueDate: '2026-09-30',
        tasks: [
          {
            title: 'Hewane — website revamp',
            description: 'Full website rebuild: information architecture, visual refresh, content, and launch. Supporting: Mark Krystal on build; Calvin on content and presence.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'project',
            priority: 'high',
            status: 'in_progress',
            progress: 15,
            startDate: '2026-08-25',
            dueDate: '2026-09-30',
          },
        ],
      },
    ],
  },
  {
    title: 'Kakamega system production',
    description: 'Final production-server setup for the Kakamega system.',
    ownerEmail: 'victor@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['victor@globeconcs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Production cutover',
        status: 'active',
        startDate: '2026-08-01',
        dueDate: '2026-08-19',
        tasks: [
          {
            title: 'Kakamega system — production setup',
            description: 'Finalizing setup after the move to the production server.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'in_progress',
            progress: 95,
            startDate: '2026-08-01',
            dueDate: '2026-08-19',
          },
        ],
      },
    ],
  },
  {
    title: 'Contabo / Power BI operations data',
    description: 'Real-time dashboards from the Contabo VPS SQL Server into Power BI, plus ongoing ODK field-data monitoring.',
    ownerEmail: 'victor@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['victor@globeconcs.com', 'krystal.markk@gmail.com'],
    status: 'active',
    milestones: [
      {
        title: 'Live dashboard pipeline',
        status: 'active',
        startDate: '2026-08-01',
        dueDate: '2026-08-21',
        tasks: [
          {
            title: 'Contabo SQL Server → Power BI real-time refresh',
            description: 'Connect the production Microsoft SQL Server on the Contabo VPS directly to Power BI Service so dashboards refresh as new data is logged. Supporting: Mark Krystal, Maurice Wagura.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'in_progress',
            progress: 70,
            startDate: '2026-08-01',
            dueDate: '2026-08-21',
          },
          {
            title: 'ODK data monitoring and n8n notifications',
            description: 'Continuous ODK monitoring so Power BI reflects field activity. Self-hosted n8n on Contabo to notify on new RWASH entries.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'operational',
            priority: 'medium',
            status: 'in_progress',
            progress: 60,
            startDate: '2026-07-01',
            dueDate: null,
          },
        ],
      },
    ],
  },
  {
    title: 'HR / Elsia automation',
    description: 'System setup and n8n automation for Elsia / HR, patterned on GCS Tender Watch.',
    ownerEmail: 'victor@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['victor@globeconcs.com', 'velma@globeconcs.com', 'elsia@globeconcs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Automation build',
        status: 'active',
        startDate: '2026-08-01',
        dueDate: '2026-08-29',
        tasks: [
          {
            title: 'Elsia / HR system setup',
            description: 'Engineering of system setup and automation based on GCS Tender Watch.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'in_progress',
            progress: 80,
            startDate: '2026-08-01',
            dueDate: '2026-08-29',
          },
          {
            title: 'Elsia / HR — n8n automation',
            description: 'n8n automation for the HR / Elsia system setup.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'in_progress',
            progress: 90,
            startDate: '2026-08-01',
            dueDate: '2026-08-28',
          },
        ],
      },
    ],
  },
  {
    title: 'Globecon website revamp',
    description: 'Redesign and modernization of the Globecon website — usability, brand identity, and content — rolling out in phases.',
    ownerEmail: 'velma@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['velma@globeconcs.com', 'calvin@globeoncs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Phase 1 — Discovery, audit and brand',
        status: 'completed',
        startDate: '2026-07-01',
        dueDate: '2026-08-15',
        tasks: [
          {
            title: 'Website — discovery and brand positioning',
            description: 'Full site audit with a prioritized page-by-page fix list. Core market positioning (“Systems”) confirmed.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'marketing',
            priority: 'high',
            status: 'completed',
            progress: 100,
            startDate: '2026-07-01',
            dueDate: '2026-08-15',
          },
        ],
      },
      {
        title: 'Phase 2 — Content and design overhaul',
        status: 'active',
        startDate: '2026-08-10',
        dueDate: '2026-08-28',
        tasks: [
          {
            title: 'Website — content and design overhaul',
            description: 'Standardize brand name usage, homepage copy, and duplicate About URLs. Supporting: Calvin Klein.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'marketing',
            priority: 'high',
            status: 'in_progress',
            progress: 92,
            startDate: '2026-08-10',
            dueDate: '2026-08-28',
          },
          {
            title: 'Website and social media management',
            description: 'Support the progressive website rollout and ongoing GCS social media presence.',
            assigneeEmail: 'calvin@globeoncs.com',
            category: 'marketing',
            priority: 'medium',
            status: 'in_progress',
            progress: 92,
            startDate: '2026-08-10',
            dueDate: '2026-08-28',
          },
        ],
      },
      {
        title: 'Phase 3 — QA and launch',
        status: 'planned',
        startDate: '2026-08-28',
        dueDate: '2026-09-12',
        tasks: [
          {
            title: 'Website — QA and go-live',
            description: 'Final cross-device review, stakeholder sign-off, and go-live.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'marketing',
            priority: 'high',
            status: 'not_started',
            progress: 0,
            startDate: '2026-08-28',
            dueDate: '2026-09-12',
          },
        ],
      },
    ],
  },
  {
    title: 'Client systems QA',
    description: 'Quality assurance across Afya Plus, Balanced Scorecard, environmental safeguards, asset management, Sacco, and NCAJ automation.',
    ownerEmail: 'velma@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['velma@globeconcs.com', 'calvin@globeoncs.com', 'krystal.markk@gmail.com', 'victor@globeconcs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Active QA tracks',
        status: 'active',
        startDate: '2026-08-01',
        dueDate: '2026-08-28',
        tasks: [
          {
            title: 'AI chatbot training and WhatsApp integration',
            description: 'Test and train the AI chatbot and WhatsApp channel against the Globecon website knowledge base. Supporting: Calvin Klein.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'in_progress',
            progress: 92,
            startDate: '2026-08-01',
            dueDate: '2026-08-31',
          },
          {
            title: 'Chatbot testing cycles',
            description: 'Continuous testing and training cycles on the chatbot and WhatsApp channel for Globecon Convergence Solutions.',
            assigneeEmail: 'calvin@globeoncs.com',
            category: 'technical',
            priority: 'medium',
            status: 'in_progress',
            progress: 92,
            startDate: '2026-08-01',
            dueDate: '2026-08-31',
          },
          {
            title: 'Balanced Scorecard — QA',
            description: 'Validate functionality, log defects to Jira. Supporting: Martha Gatimu and Calvin Klein. Awaiting response.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'waiting',
            progress: 80,
            startDate: '2026-08-01',
            dueDate: '2026-08-28',
          },
          {
            title: 'Environmental & social safeguards monitoring tool',
            description: 'Support development and QA for Sudan, Ethiopia, and Somalia. Supporting: Martha Gatimu. Awaiting response.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'project',
            priority: 'medium',
            status: 'waiting',
            progress: 50,
            startDate: '2026-08-01',
            dueDate: '2026-08-28',
          },
          {
            title: 'Afya Plus hospital management system — QA',
            description: 'Functional and UAT testing. Supporting: Josephine Kalunda, Martha Gatimu. Awaiting response.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'waiting',
            progress: 50,
            startDate: '2026-08-01',
            dueDate: '2026-08-28',
          },
          {
            title: 'Afya Plus — error review',
            description: 'Identify and log functional errors ahead of resolution, feeding the broader QA effort.',
            assigneeEmail: 'calvin@globeoncs.com',
            category: 'technical',
            priority: 'medium',
            status: 'in_progress',
            progress: 50,
            startDate: '2026-08-01',
            dueDate: '2026-08-28',
          },
          {
            title: 'Asset management system — QA',
            description: 'Review asset management and quality analysis. Supporting: Calvin and Martha Gatimu.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'technical',
            priority: 'medium',
            status: 'in_progress',
            progress: 80,
            startDate: '2026-08-01',
            dueDate: '2026-08-28',
          },
          {
            title: 'Asset management — quality review',
            description: 'Reviewing asset management and doing quality analysis.',
            assigneeEmail: 'calvin@globeoncs.com',
            category: 'technical',
            priority: 'medium',
            status: 'in_progress',
            progress: 50,
            startDate: '2026-08-01',
            dueDate: '2026-08-28',
          },
          {
            title: 'NCAJ MEL report updates',
            description: 'Maintain the NCAJ Monitoring, Evaluation and Learning report.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'operational',
            priority: 'medium',
            status: 'in_progress',
            progress: 80,
            dueDate: null,
          },
          {
            title: 'NCAJ — n8n daily task automation',
            description: 'New submissions detected automatically and notification emails sent with no manual check. Supporting: Josephine Kalunda, Mark Krystal.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'technical',
            priority: 'medium',
            status: 'completed',
            progress: 100,
            dueDate: '2026-08-19',
          },
          {
            title: 'Sacco system — QA',
            description: 'QA testing with issues logged to Jira for Daniel. Supporting: Mark Krystal.',
            assigneeEmail: 'victor@globeconcs.com',
            category: 'technical',
            priority: 'medium',
            status: 'completed',
            progress: 100,
            dueDate: '2026-08-19',
          },
        ],
      },
    ],
  },
  {
    title: 'ODK digital forms',
    description: 'ODK form lifecycle for field enumerators across Sudan, Somalia, and Ethiopia.',
    ownerEmail: 'velma@globeconcs.com',
    departmentSlug: 'technology',
    teamEmails: ['velma@globeconcs.com', 'krystal.markk@gmail.com'],
    status: 'active',
    milestones: [
      {
        title: 'Form development and deployment',
        status: 'completed',
        startDate: '2026-07-01',
        dueDate: '2026-08-11',
        tasks: [
          {
            title: 'ODK form development and deployment',
            description: 'Questionnaire authoring, XLSForm design, validation, testing, and publish for field enumerators. Supporting: Martha Gatimu, Mark Krystal. Continuous upkeep.',
            assigneeEmail: 'velma@globeconcs.com',
            category: 'technical',
            priority: 'high',
            status: 'completed',
            progress: 100,
            startDate: '2026-07-01',
            dueDate: '2026-08-11',
          },
        ],
      },
    ],
  },
  {
    title: '2026 proposal pipeline',
    description: 'Live bids and joint ventures owned by Business Development.',
    ownerEmail: 'patrick@globeconcs.com',
    departmentSlug: 'operations',
    teamEmails: ['patrick@globeconcs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Active submissions',
        status: 'active',
        startDate: '2026-08-01',
        dueDate: '2026-09-27',
        tasks: [
          {
            title: 'UNSCAR proposal — KNFP weapons disarmament',
            description: 'Proposal for strengthening PSSM and safe weapons destruction capacity for Kenya’s National Focal Point, UNSCAR 2026 Category 2 field operations.',
            assigneeEmail: 'patrick@globeconcs.com',
            category: 'business_development',
            priority: 'high',
            status: 'in_progress',
            progress: 80,
            dueDate: '2026-08-26',
          },
          {
            title: 'IDMIS EOI — State Department for Devolution',
            description: 'EOI KE-SDD-531922-CS-QCBS under World Bank KDSP II. Joint venture with Regional Development Consultants Ltd; GCS lead firm.',
            assigneeEmail: 'patrick@globeconcs.com',
            category: 'business_development',
            priority: 'high',
            status: 'completed',
            progress: 100,
            dueDate: '2026-08-20',
          },
          {
            title: 'SVRI proposal — knowledge for action',
            description: 'Sexual Violence Research Initiative proposal: Knowledge for Action to End Violence Against Women and Child Sexual Violence.',
            assigneeEmail: 'patrick@globeconcs.com',
            category: 'business_development',
            priority: 'high',
            status: 'in_progress',
            progress: 50,
            dueDate: '2026-09-17',
          },
          {
            title: 'FOODIE — Kalimoni Primary School',
            description: 'Cashless school meal ledger (tap-to-eat) rollout proposal for Kalimoni Primary School.',
            assigneeEmail: 'patrick@globeconcs.com',
            category: 'business_development',
            priority: 'medium',
            status: 'in_progress',
            progress: 40,
            dueDate: null,
          },
          {
            title: 'OTHERwise JV — MSF Eastern Africa membership portal',
            description: 'JV proposal for migration and redevelopment of the MSFEA Association Membership Portal, RFP-EA-ASSO-ITC-0002.',
            assigneeEmail: 'patrick@globeconcs.com',
            category: 'business_development',
            priority: 'high',
            status: 'in_progress',
            progress: 50,
            dueDate: '2026-09-27',
          },
        ],
      },
    ],
  },
  {
    title: 'GCS capability statement',
    description: 'Corporate capability brochure for client and partner distribution.',
    ownerEmail: 'calvin@globeoncs.com',
    departmentSlug: 'client-services',
    teamEmails: ['calvin@globeoncs.com'],
    status: 'active',
    milestones: [
      {
        title: 'Brochure design',
        status: 'active',
        startDate: '2026-08-20',
        dueDate: '2026-09-01',
        tasks: [
          {
            title: 'Corporate capability statement brochure',
            description: 'Design and finalize GCS’s corporate capability statement. In collaboration with Paul Huki.',
            assigneeEmail: 'calvin@globeoncs.com',
            category: 'marketing',
            priority: 'medium',
            status: 'in_progress',
            progress: 10,
            startDate: '2026-08-20',
            dueDate: '2026-09-01',
          },
        ],
      },
    ],
  },
]

export const DEMO_TASK_TITLES = [
  'Finalize Q3 operations review',
  'Update client onboarding checklist',
  'Prepare campaign performance report',
  'Resolve payroll reconciliation',
  'Deploy internal knowledge base',
  'Harden WorkHub access roles',
  'Collect department weekly updates',
  'Confirm Q4 delivery capacity',
  'Issue August vendor payments',
  'Refresh GCS service one-pagers',
  'Approve department scorecard draft',
  'Document backup and restore runbook',
]
