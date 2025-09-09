import fs from 'fs';
import path from 'path';

/**
 * Health Analyzer - Process Fitbit data for AI coaching insights
 * Analyzes sleep, activity, and wellness data for personalized recommendations
 */

// Parse Fitbit sleep data for last 14 days
export async function parseSleepData(fitbitDir) {
	const sleepFiles = fs.readdirSync(path.join(fitbitDir, 'Global Export Data'))
		.filter(file => file.startsWith('sleep-') && file.endsWith('.json'))
		.sort()
		.slice(-2); // Last 2 files for recent data

	const sleepData = [];
	
	for (const file of sleepFiles) {
		try {
			const filePath = path.join(fitbitDir, 'Global Export Data', file);
			const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
			
			// Filter to last 14 days only
			const twoWeeksAgo = new Date();
			twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
			
			const recentSleep = data.filter(record => {
				const sleepDate = new Date(record.dateOfSleep);
				return sleepDate >= twoWeeksAgo;
			});
			
			sleepData.push(...recentSleep);
		} catch (error) {
			console.warn(`[health-analyzer] Failed to parse ${file}:`, error.message);
		}
	}

	return sleepData.sort((a, b) => new Date(a.dateOfSleep) - new Date(b.dateOfSleep));
}

// Parse activity data (steps, calories, etc.)
export async function parseActivityData(fitbitDir) {
	const activityData = {};
	
	try {
		// Get recent steps data
		const stepsFiles = fs.readdirSync(path.join(fitbitDir, 'Global Export Data'))
			.filter(file => file.startsWith('steps-') && file.endsWith('.json'))
			.sort()
			.slice(-1); // Most recent file

		if (stepsFiles.length > 0) {
			const stepsPath = path.join(fitbitDir, 'Global Export Data', stepsFiles[0]);
			const stepsData = JSON.parse(fs.readFileSync(stepsPath, 'utf8'));
			
			// Aggregate daily step totals for last 14 days
			activityData.dailySteps = aggregateStepsByDay(stepsData);
		}

		// Get calories data
		const calorieFiles = fs.readdirSync(path.join(fitbitDir, 'Global Export Data'))
			.filter(file => file.startsWith('calories-') && file.endsWith('.json'))
			.sort()
			.slice(-1);

		if (calorieFiles.length > 0) {
			const caloriesPath = path.join(fitbitDir, 'Global Export Data', calorieFiles[0]);
			const caloriesData = JSON.parse(fs.readFileSync(caloriesPath, 'utf8'));
			activityData.dailyCalories = aggregateCaloriesByDay(caloriesData);
		}

	} catch (error) {
		console.warn('[health-analyzer] Failed to parse activity data:', error.message);
	}

	return activityData;
}

// Aggregate minute-by-minute steps into daily totals
function aggregateStepsByDay(stepsData) {
	const dailyTotals = {};
	const twoWeeksAgo = new Date();
	twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

	stepsData.forEach(record => {
		const date = new Date(record.dateTime);
		if (date < twoWeeksAgo) return;

		const dayKey = date.toISOString().split('T')[0];
		if (!dailyTotals[dayKey]) {
			dailyTotals[dayKey] = 0;
		}
		dailyTotals[dayKey] += parseInt(record.value) || 0;
	});

	return Object.entries(dailyTotals)
		.map(([date, steps]) => ({ date, steps }))
		.sort((a, b) => new Date(a.date) - new Date(b.date))
		.slice(-14); // Last 14 days only
}

// Aggregate calories by day
function aggregateCaloriesByDay(caloriesData) {
	const dailyTotals = {};
	const twoWeeksAgo = new Date();
	twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

	caloriesData.forEach(record => {
		const date = new Date(record.dateTime);
		if (date < twoWeeksAgo) return;

		const dayKey = date.toISOString().split('T')[0];
		if (!dailyTotals[dayKey]) {
			dailyTotals[dayKey] = 0;
		}
		dailyTotals[dayKey] += parseFloat(record.value) || 0;
	});

	return Object.entries(dailyTotals)
		.map(([date, calories]) => ({ date, calories }))
		.sort((a, b) => new Date(a.date) - new Date(b.date))
		.slice(-14);
}

// Generate comprehensive health insights
export function generateHealthInsights(sleepData, activityData) {
	const insights = {
		timestamp: new Date().toISOString(),
		period: '14 days',
		metrics: {},
		patterns: {},
		recommendations: []
	};

	// Sleep analysis
	if (sleepData.length > 0) {
		const avgSleepDuration = sleepData.reduce((sum, night) => sum + night.minutesAsleep, 0) / sleepData.length;
		const avgEfficiency = sleepData.reduce((sum, night) => sum + night.efficiency, 0) / sleepData.length;
		const avgDeepSleep = sleepData.reduce((sum, night) => {
			return sum + (night.levels?.summary?.deep?.minutes || 0);
		}, 0) / sleepData.length;

		insights.metrics.sleep = {
			avgDuration: Math.round(avgSleepDuration),
			avgEfficiency: Math.round(avgEfficiency),
			avgDeepSleep: Math.round(avgDeepSleep),
			totalNights: sleepData.length,
			sleepScore: calculateSleepScore(avgSleepDuration, avgEfficiency, avgDeepSleep)
		};

		// Sleep patterns
		insights.patterns.sleepConsistency = analyzeSleepConsistency(sleepData);
		insights.patterns.bedtimePattern = analyzeBedtimePattern(sleepData);
	}

	// Activity analysis
	if (activityData.dailySteps) {
		const avgSteps = activityData.dailySteps.reduce((sum, day) => sum + day.steps, 0) / activityData.dailySteps.length;
		const bestDay = activityData.dailySteps.reduce((max, day) => day.steps > max.steps ? day : max);
		
		insights.metrics.activity = {
			avgDailySteps: Math.round(avgSteps),
			bestDay: bestDay.steps,
			bestDate: bestDay.date,
			activeDays: activityData.dailySteps.filter(day => day.steps > 8000).length,
			activityScore: calculateActivityScore(avgSteps)
		};
	}

	// Calculate recovery metrics and generate coaching data
	const recovery = calculateRecoveryMetrics(sleepData, activityData);
	const coachingData = generateHealthCoachingData(insights.metrics, insights.patterns, recovery);
	
	insights.recovery = recovery;
	insights.coachingData = coachingData;

	return insights;
}

// Calculate sleep quality score (0-100)
function calculateSleepScore(duration, efficiency, deepSleep) {
	let score = 0;
	
	// Duration score (0-40 points)
	if (duration >= 420 && duration <= 540) { // 7-9 hours optimal
		score += 40;
	} else if (duration >= 360) { // 6+ hours decent
		score += 25;
	} else {
		score += 10; // Less than 6 hours
	}

	// Efficiency score (0-35 points)
	if (efficiency >= 95) score += 35;
	else if (efficiency >= 85) score += 25;
	else if (efficiency >= 75) score += 15;
	else score += 5;

	// Deep sleep score (0-25 points)
	if (deepSleep >= 90) score += 25;
	else if (deepSleep >= 60) score += 20;
	else if (deepSleep >= 45) score += 15;
	else score += 5;

	return Math.min(100, score);
}

// Calculate activity score (0-100)
function calculateActivityScore(avgSteps) {
	if (avgSteps >= 12000) return 100;
	if (avgSteps >= 10000) return 85;
	if (avgSteps >= 8000) return 70;
	if (avgSteps >= 6000) return 50;
	if (avgSteps >= 4000) return 30;
	return 15;
}

// Analyze sleep consistency
function analyzeSleepConsistency(sleepData) {
	const bedtimes = sleepData.map(night => {
		const bedtime = new Date(night.startTime);
		return bedtime.getHours() + (bedtime.getMinutes() / 60);
	});

	const avgBedtime = bedtimes.reduce((sum, time) => sum + time, 0) / bedtimes.length;
	const variance = bedtimes.reduce((sum, time) => sum + Math.pow(time - avgBedtime, 2), 0) / bedtimes.length;
	const consistency = Math.max(0, 100 - (Math.sqrt(variance) * 20));

	return {
		score: Math.round(consistency),
		avgBedtime: formatTime(avgBedtime),
		variance: Math.round(Math.sqrt(variance) * 60) // in minutes
	};
}

// Analyze bedtime patterns
function analyzeBedtimePattern(sleepData) {
	const weekdays = [];
	const weekends = [];

	sleepData.forEach(night => {
		const date = new Date(night.dateOfSleep);
		const dayOfWeek = date.getDay();
		const bedtime = new Date(night.startTime);
		const bedtimeHours = bedtime.getHours() + (bedtime.getMinutes() / 60);

		if (dayOfWeek === 0 || dayOfWeek === 6) { // Weekend
			weekends.push(bedtimeHours);
		} else { // Weekday
			weekdays.push(bedtimeHours);
		}
	});

	return {
		weekdayAvg: weekdays.length > 0 ? formatTime(weekdays.reduce((sum, time) => sum + time, 0) / weekdays.length) : null,
		weekendAvg: weekends.length > 0 ? formatTime(weekends.reduce((sum, time) => sum + time, 0) / weekends.length) : null,
		difference: weekdays.length > 0 && weekends.length > 0 ? 
			Math.round((weekends.reduce((sum, time) => sum + time, 0) / weekends.length - 
						weekdays.reduce((sum, time) => sum + time, 0) / weekdays.length) * 60) : 0
	};
}

// Calculate recovery metrics for AI coaching
function calculateRecoveryMetrics(sleepData, activityData) {
	const recovery = {
		sleepDebt: 0,
		consistencyScore: 0,
		recoveryColor: 'green',
		currentStrain: 'medium',
		restingHR: null,
		fitnessLevel: 'moderate'
	};

	if (sleepData.length > 0) {
		// Calculate sleep debt (weekly deficit from 7.5hr optimal)
		const weeklyOptimal = 7.5 * 60 * 7; // 7.5 hours × 7 days in minutes
		const actualWeekly = sleepData.slice(-7).reduce((sum, night) => sum + night.minutesAsleep, 0);
		recovery.sleepDebt = Math.max(0, weeklyOptimal - actualWeekly);

		// Sleep consistency (bedtime variance)
		const bedtimes = sleepData.slice(-7).map(night => {
			const bedtime = new Date(night.startTime);
			return bedtime.getHours() + (bedtime.getMinutes() / 60);
		});
		const avgBedtime = bedtimes.reduce((sum, time) => sum + time, 0) / bedtimes.length;
		const variance = Math.sqrt(bedtimes.reduce((sum, time) => sum + Math.pow(time - avgBedtime, 2), 0) / bedtimes.length);
		recovery.consistencyScore = Math.max(0, 100 - (variance * 20));

		// Recovery color based on sleep efficiency and duration
		const avgEfficiency = sleepData.slice(-3).reduce((sum, night) => sum + night.efficiency, 0) / Math.min(3, sleepData.length);
		const avgDuration = sleepData.slice(-3).reduce((sum, night) => sum + night.minutesAsleep, 0) / Math.min(3, sleepData.length);
		
		if (avgEfficiency >= 85 && avgDuration >= 420) {
			recovery.recoveryColor = 'green';
		} else if (avgEfficiency >= 75 && avgDuration >= 360) {
			recovery.recoveryColor = 'yellow';
		} else {
			recovery.recoveryColor = 'red';
		}
	}

	if (activityData.dailySteps && activityData.dailySteps.length > 0) {
		// Current strain based on recent activity
		const recentSteps = activityData.dailySteps.slice(-3);
		const avgSteps = recentSteps.reduce((sum, day) => sum + day.steps, 0) / recentSteps.length;
		
		if (avgSteps >= 15000) recovery.currentStrain = 'high';
		else if (avgSteps >= 10000) recovery.currentStrain = 'medium';
		else recovery.currentStrain = 'low';

		// Fitness level inference
		const overallAvg = activityData.dailySteps.reduce((sum, day) => sum + day.steps, 0) / activityData.dailySteps.length;
		if (overallAvg >= 12000) recovery.fitnessLevel = 'high';
		else if (overallAvg >= 8000) recovery.fitnessLevel = 'moderate';
		else recovery.fitnessLevel = 'beginner';
	}

	return recovery;
}

// Generate structured health coaching data for AI
function generateHealthCoachingData(metrics, patterns, recovery) {
	const coachingData = {
		// Current metrics
		sleepDebt: `${Math.round(recovery.sleepDebt / 60 * 10) / 10} hours this week`,
		sleepConsistency: `${Math.round(recovery.consistencyScore)}% (variance: ${patterns.sleepConsistency?.variance || 0} minutes)`,
		recoveryColor: recovery.recoveryColor,
		currentStrain: recovery.currentStrain,
		fitnessLevel: recovery.fitnessLevel,
		
		// Sleep metrics
		avgSleepDuration: `${Math.round(metrics.sleep?.avgDuration / 60 * 10) / 10} hours`,
		sleepEfficiency: `${metrics.sleep?.avgEfficiency || 0}%`,
		deepSleep: `${metrics.sleep?.avgDeepSleep || 0} minutes/night`,
		sleepScore: `${metrics.sleep?.sleepScore || 0}/100`,
		
		// Activity metrics  
		avgDailySteps: metrics.activity?.avgDailySteps || 0,
		bestDay: `${metrics.activity?.bestDay || 0} steps on ${metrics.activity?.bestDate || 'N/A'}`,
		activeDays: `${metrics.activity?.activeDays || 0} days >8k steps`,
		activityScore: `${metrics.activity?.activityScore || 0}/100`,
		
		// Patterns
		weekdayBedtime: patterns.bedtimePattern?.weekdayAvg || 'N/A',
		weekendBedtime: patterns.bedtimePattern?.weekendAvg || 'N/A',
		weekendShift: `${patterns.bedtimePattern?.difference || 0} minutes later on weekends`,
		
		// Goals and preferences (can be expanded based on user input)
		userGoal: 'Optimize overall health and energy',
		dietStyle: 'Balanced, culturally flexible'
	};

	return coachingData;
}

// Helper function to format time
function formatTime(decimalTime) {
	const hours = Math.floor(decimalTime);
	const minutes = Math.round((decimalTime - hours) * 60);
	return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

// Main analysis function
export async function analyzeHealthData(fitbitDir) {
	console.log('[health-analyzer] Starting Fitbit data analysis...');
	
	try {
		const sleepData = await parseSleepData(fitbitDir);
		const activityData = await parseActivityData(fitbitDir);
		const insights = generateHealthInsights(sleepData, activityData);
		
		console.log(`[health-analyzer] Analysis complete: ${sleepData.length} nights, ${activityData.dailySteps?.length || 0} activity days`);
		
		return {
			success: true,
			data: insights,
			rawData: { sleepData, activityData }
		};
	} catch (error) {
		console.error('[health-analyzer] Analysis failed:', error);
		return {
			success: false,
			error: error.message
		};
	}
}