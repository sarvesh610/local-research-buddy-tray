/**
 * Health Dashboard Module
 * Handles all health-related UI components and data visualization
 */

export function createHealthDashboard(res) {
  if (!document.getElementById('health-dashboard-styles')) {
    const style = document.createElement('style');
    style.id = 'health-dashboard-styles';
    style.textContent = `
      .health-dashboard {
        background: #ffffff !important;
        padding: 8px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        color: #000000 !important;
        border-radius: 8px;
        box-shadow: 0 1px 6px rgba(0,0,0,0.1);
        margin: 12px 0;
        max-width: 280px;
        margin: 12px auto;
      }
      
      /* Row 1: Steps */
      .steps-row {
        text-align: center;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid #f0f0f0;
      }
      
      .steps-ring {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 3px solid #f0f0f0;
        border-top: 3px solid #007aff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        margin-bottom: 3px;
      }
      
      .steps-number {
        font-size: 14px !important;
        font-weight: 800 !important;
        color: #000000 !important;
        line-height: 1;
      }
      
      .steps-label {
        font-size: 11px !important;
        color: #000000 !important;
        font-weight: 600;
      }
      
      /* Row 2: Activity Metrics */
      .activity-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid #f0f0f0;
        gap: 4px;
      }
      
      .metric-item {
        text-align: center;
        flex: 1;
        min-width: 0;
      }
      
      .metric-header {
        font-size: 9px !important;
        color: #666666 !important;
        font-weight: 500;
        margin-bottom: 1px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      
      .metric-value {
        font-size: 14px !important;
        font-weight: 700 !important;
        color: #000000 !important;
      }
      
      /* Row 3: Health Stats */
      .health-row {
        display: flex;
        justify-content: space-between;
        gap: 4px;
      }
      
      .health-item {
        flex: 1;
        text-align: center;
        min-width: 0;
      }
      
      .health-header {
        font-size: 9px !important;
        color: #666666 !important;
        font-weight: 500;
        margin-bottom: 3px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      
      .health-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }
      
      .health-icon {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        margin-bottom: 1px;
      }
      
      .sleep-icon { 
        background: #e8e3ff !important; 
        color: #7c3aed !important; 
      }
      .exercise-icon { 
        background: #fef3e2 !important; 
        color: #f59e0b !important; 
      }
      .heart-icon { 
        background: #fee2e2 !important; 
        color: #ef4444 !important; 
      }
      
      .health-value {
        font-size: 10px !important;
        font-weight: 700 !important;
        color: #000000 !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Extract health data
  const health = res.healthMetrics || {};
  const rec = res.recovery || {};
  const coach = res.coachingData || {};

  // Calculate metrics
  const avgSleepHours = health.sleep?.avgDurationMin ? (health.sleep.avgDurationMin / 60).toFixed(1) : '7.2';
  const sleepEfficiency = health.sleep?.efficiencyPct || 93;
  const dailySteps = health.activity?.avgDailySteps || 10232;
  const activeDays = health.activity?.activeDaysOver8k || 10;

  // Sleep stages visualization
  const sleepHeights = [18, 12, 24, 8, 22, 14, 28, 10, 20, 16, 26, 12, 24, 18, 30, 14, 
                      16, 20, 22, 8, 26, 12, 20, 16, 18, 24, 28, 10, 22, 14, 16, 20,
                      24, 12, 18, 26, 14, 22, 16, 24, 12, 20, 18, 28, 16, 14, 22, 20];
  const sleepTypes = ['deep', 'light', 'rem', 'awake'];
  const sleepBars = sleepHeights.map((height, i) => 
    `<div class="sleep-bar ${sleepTypes[i % 4]}" style="height: ${height}px;"></div>`
  ).join('');

  // Activity trend bars
  const activityHeights = [65, 80, 75, 90, 85, 70, 95]; // Last 7 days
  const activityBars = activityHeights.map(height => 
    `<div class="activity-bar" style="height: ${height}%;"></div>`
  ).join('');

  // Recovery status
  const recoveryColor = (rec.recoveryColor || 'green').toLowerCase();
  const recoveryIcon = recoveryColor === 'green' ? '✓' : recoveryColor === 'yellow' ? '⚠' : '⚡';
  const recoveryLabel = recoveryColor === 'green' ? 'Optimal Recovery' : 
                       recoveryColor === 'yellow' ? 'Moderate Recovery' : 'Low Recovery';

  return `
    <div class="health-dashboard">
      <!-- Row 1: Steps Only -->
      <div class="steps-row">
        <div class="steps-ring">
          <div class="steps-number">${Math.round(dailySteps/1000)}k</div>
        </div>
        <div class="steps-label">Steps</div>
      </div>

      <!-- Row 2: Activity Metrics -->
      <div class="activity-row">
        <div class="metric-item">
          <div class="metric-header">Miles</div>
          <div class="metric-value">4.2</div>
        </div>
        <div class="metric-item">
          <div class="metric-header">Floors</div>
          <div class="metric-value">6</div>
        </div>
        <div class="metric-item">
          <div class="metric-header">Mins</div>
          <div class="metric-value">15</div>
        </div>
        <div class="metric-item">
          <div class="metric-header">Cals</div>
          <div class="metric-value">1768</div>
        </div>
      </div>

      <!-- Row 3: Health Stats -->
      <div class="health-row">
        <div class="health-item">
          <div class="health-header">Sleep</div>
          <div class="health-content">
            <div class="health-icon sleep-icon">😴</div>
            <div class="health-value">${avgSleepHours}h 16m</div>
          </div>
        </div>
        <div class="health-item">
          <div class="health-header">Exercise</div>
          <div class="health-content">
            <div class="health-icon exercise-icon">🏃‍♂️</div>
            <div class="health-value">${activeDays}/5 days</div>
          </div>
        </div>
        <div class="health-item">
          <div class="health-header">Heart Rate</div>
          <div class="health-content">
            <div class="health-icon heart-icon">❤️</div>
            <div class="health-value">74 bpm</div>
          </div>
        </div>
      </div>
    </div>
    <div class="summary-force health-output"></div>
  `;
}

export function formatHealthOutput(text) {
  // Convert markdown-style output to user-friendly structured format
  const sections = text.split('###').filter(s => s.trim());
  let formatted = '';
  
  sections.forEach(section => {
    const lines = section.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return;
    
    const title = lines[0].trim();
    const content = lines.slice(1).join('\n');
    
    if (title.includes('Daily Card')) {
      const actionMatch = content.match(/\*\*Action:\*\*(.*?)(?=---|$)/s);
      if (actionMatch) {
        formatted += `
          <div class="health-plan-section">
            <div class="health-plan-title">🎯 Today's Priority Action</div>
            <div style="padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; font-size: 11px; line-height: 1.4;">
              ${actionMatch[1].trim()}
            </div>
          </div>
        `;
      }
    } else if (title.includes('7-Day Sleep Plan')) {
      formatted += `
        <div class="health-plan-section">
          <div class="health-plan-title">😴 7-Day Sleep Plan</div>
          ${parseSleepPlanTable(content)}
        </div>
      `;
    } else if (title.includes('7-Day Training Plan')) {
      formatted += `
        <div class="health-plan-section">
          <div class="health-plan-title">💪 7-Day Training Plan</div>
          ${parseTrainingPlan(content)}
        </div>
      `;
    } else if (title.includes('Diet Plan')) {
      formatted += `
        <div class="health-plan-section">
          <div class="health-plan-title">🍎 Diet Plan</div>
          ${parseDietPlan(content)}
        </div>
      `;
    } else if (title.includes('Why')) {
      formatted += `
        <div class="health-plan-section">
          <div class="health-plan-title">🧠 Why These Recommendations</div>
          <div style="font-size: 10px; line-height: 1.4; color: var(--muted);">
            ${content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
          </div>
        </div>
      `;
    }
  });
  
  return formatted || text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function parseSleepPlanTable(content) {
  // Extract table data and format as proper HTML table
  const tableMatch = content.match(/\| Day.*?\|[\s\S]*?(?=\n\n|$)/);
  if (!tableMatch) return `<div style="font-size: 10px;">${content.replace(/\n/g, '<br>')}</div>`;
  
  const rows = tableMatch[0].split('\n').filter(row => row.includes('|') && !row.includes('---'));
  let table = '<table class="health-table">';
  
  rows.forEach((row, index) => {
    const cells = row.split('|').map(cell => cell.trim()).filter(cell => cell);
    if (index === 0) {
      table += '<tr>' + cells.map(cell => `<th>${cell}</th>`).join('') + '</tr>';
    } else {
      table += '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
    }
  });
  
  table += '</table>';
  return table;
}

function parseTrainingPlan(content) {
  const lines = content.split('\n').filter(l => l.trim());
  let result = '<div style="font-size: 10px; line-height: 1.4;">';
  
  lines.forEach(line => {
    if (line.includes('Day ')) {
      result += `<div style="margin: 8px 0 4px 0; font-weight: 600; color: var(--accent);">${line.replace(/\*\*/g, '')}</div>`;
    } else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
      result += `<div style="margin-left: 12px; margin: 2px 0; color: var(--muted);">${line.replace(/^\s*[-•]\s*/, '• ')}</div>`;
    } else if (line.trim()) {
      result += `<div style="margin: 4px 0; color: var(--muted);">${line}</div>`;
    }
  });
  
  result += '</div>';
  return result;
}

function parseDietPlan(content) {
  const lines = content.split('\n').filter(l => l.trim());
  let result = '<div style="font-size: 10px; line-height: 1.4;">';
  
  lines.forEach(line => {
    if (line.includes('Calories') || line.includes('Protein') || line.includes('Carbs')) {
      result += `<div style="margin: 4px 0; font-weight: 600; color: var(--accent);">${line.replace(/\*\*/g, '')}</div>`;
    } else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
      result += `<div style="margin-left: 12px; margin: 2px 0; color: var(--muted);">${line.replace(/^\s*[-•]\s*/, '• ')}</div>`;
    } else if (line.trim()) {
      result += `<div style="margin: 4px 0; color: var(--muted);">${line}</div>`;
    }
  });
  
  result += '</div>';
  return result;
}