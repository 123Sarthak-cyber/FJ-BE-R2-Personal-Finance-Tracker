// Personal Finance Tracker - Frontend JavaScript

// API Base URL
const API_URL = '/api';

// State
let token = localStorage.getItem('token');
let user = null;
let currentPage = 1;
let expenseChart = null;
let trendChart = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Check for token in URL (from OAuth callback)
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  if (urlToken) {
    token = urlToken;
    localStorage.setItem('token', token);
    window.history.replaceState({}, document.title, '/');
  }

  if (token) {
    verifyToken();
  } else {
    showAuthSection();
  }

  // Initialize report selects
  initReportSelects();
});

// API Helper
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Auth Functions
function showAuthSection() {
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('main-section').classList.add('hidden');
}

function showMainSection() {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('main-section').classList.remove('hidden');
  loadDashboard();
}

function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
}

function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const response = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    token = response.data.token;
    user = response.data.user;
    localStorage.setItem('token', token);
    showToast('Login successful!');
    showMainSection();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const firstName = document.getElementById('register-firstname').value;
  const lastName = document.getElementById('register-lastname').value;

  try {
    const response = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, firstName, lastName })
    });

    token = response.data.token;
    user = response.data.user;
    localStorage.setItem('token', token);
    showToast('Registration successful!');
    showMainSection();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function verifyToken() {
  try {
    const response = await api('/auth/verify');
    user = response.user;
    showMainSection();
  } catch (error) {
    localStorage.removeItem('token');
    token = null;
    showAuthSection();
  }
}

function logout() {
  localStorage.removeItem('token');
  token = null;
  user = null;
  showAuthSection();
  showToast('Logged out successfully');
}

// Navigation
function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  
  // Show selected section
  document.getElementById(`${sectionName}-section`).classList.remove('hidden');
  
  // Update nav
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  // Load section data
  switch (sectionName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'transactions':
      loadTransactions();
      break;
    case 'categories':
      loadCategories();
      break;
    case 'budgets':
      loadBudgets();
      break;
    case 'reports':
      // Don't auto-load, wait for user to generate
      break;
    case 'ai':
      loadAIInsights();
      break;
    case 'import':
      // Don't auto-load, wait for user to upload
      break;
    case 'anomalies':
      loadAnomalies();
      break;
  }
}

// Dashboard
async function loadDashboard() {
  try {
    const [dashboardData, balanceData] = await Promise.all([
      api('/dashboard'),
      api('/dashboard/balance')
    ]);

    const data = dashboardData.data;
    
    // Update user name
    document.getElementById('user-name').textContent = user?.firstName || user?.email || 'User';

    // Update summary cards
    document.getElementById('summary-income').textContent = formatCurrency(data.summary.income);
    document.getElementById('summary-expenses').textContent = formatCurrency(data.summary.expenses);
    document.getElementById('summary-savings').textContent = formatCurrency(data.summary.savings);
    document.getElementById('summary-balance').textContent = formatCurrency(balanceData.data.balance);

    // Update changes
    updateChange('income-change', data.comparison.incomeChange);
    updateChange('expenses-change', data.comparison.expenseChange);
    document.getElementById('savings-rate').textContent = `${data.summary.savingsRate}% savings rate`;

    // Update expense chart
    renderExpenseChart(data.expenseByCategory);

    // Update trend chart
    renderTrendChart(data.monthlyTrend);

    // Update recent transactions
    renderRecentTransactions(data.recentTransactions);

    // Update budget alerts
    renderBudgetAlerts(data.budgetAlerts);

  } catch (error) {
    showToast('Error loading dashboard', 'error');
  }
}

function updateChange(elementId, value) {
  const element = document.getElementById(elementId);
  const isPositive = value >= 0;
  element.textContent = `${isPositive ? '+' : ''}${value.toFixed(1)}% vs last month`;
  element.className = `change ${isPositive ? 'positive' : 'negative'}`;
}

function renderExpenseChart(categories) {
  const ctx = document.getElementById('expense-chart').getContext('2d');
  
  if (expenseChart) {
    expenseChart.destroy();
  }

  if (categories.length === 0) {
    ctx.canvas.parentElement.innerHTML = '<p style="text-align: center; color: #6b7280;">No expense data for this month</p>';
    return;
  }

  expenseChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories.map(c => c.name),
      datasets: [{
        data: categories.map(c => c.amount),
        backgroundColor: categories.map(c => c.color),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'right'
        }
      }
    }
  });
}

function renderTrendChart(trend) {
  const ctx = document.getElementById('trend-chart').getContext('2d');
  
  if (trendChart) {
    trendChart.destroy();
  }

  const months = trend.map(t => {
    const date = new Date(t.month);
    return date.toLocaleDateString('en-US', { month: 'short' });
  });

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Income',
          data: trend.map(t => t.income),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Expenses',
          data: trend.map(t => t.expenses),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function renderRecentTransactions(transactions) {
  const container = document.getElementById('recent-transactions');
  
  if (transactions.length === 0) {
    container.innerHTML = '<p style="color: #6b7280;">No transactions yet</p>';
    return;
  }

  container.innerHTML = transactions.map(t => `
    <div class="transaction-item">
      <div class="transaction-icon" style="background: ${t.category?.color || '#6366f1'}20; color: ${t.category?.color || '#6366f1'}">
        ${t.type === 'income' ? '↑' : '↓'}
      </div>
      <div class="transaction-details">
        <h4>${t.description || t.category?.name || 'Transaction'}</h4>
        <p>${formatDate(t.date)}</p>
      </div>
      <div class="transaction-amount ${t.type}">
        ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
      </div>
    </div>
  `).join('');
}

function renderBudgetAlerts(alerts) {
  const container = document.getElementById('budget-alerts');
  
  if (alerts.length === 0) {
    container.innerHTML = '<p style="color: #6b7280;">All budgets on track! 🎉</p>';
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="budget-alert ${a.isOverBudget ? 'exceeded' : 'warning'}">
      <span style="color: ${a.categoryColor}">${a.categoryName}</span>: 
      ${a.percentage}% used (${formatCurrency(a.spentAmount)} / ${formatCurrency(a.budgetAmount)})
    </div>
  `).join('');
}

// Transactions
async function loadTransactions() {
  try {
    const type = document.getElementById('filter-type').value;
    const startDate = document.getElementById('filter-start').value;
    const endDate = document.getElementById('filter-end').value;

    let query = `?page=${currentPage}&limit=15`;
    if (type) query += `&type=${type}`;
    if (startDate) query += `&startDate=${startDate}`;
    if (endDate) query += `&endDate=${endDate}`;

    const response = await api(`/transactions${query}`);
    const { transactions, pagination } = response.data;

    const container = document.getElementById('transactions-list');

    if (transactions.length === 0) {
      container.innerHTML = '<p style="padding: 40px; text-align: center; color: #6b7280;">No transactions found</p>';
      document.getElementById('transactions-pagination').innerHTML = '';
      return;
    }

    container.innerHTML = transactions.map(t => `
      <div class="transaction-item">
        <div class="transaction-icon" style="background: ${t.category?.color || '#6366f1'}20; color: ${t.category?.color || '#6366f1'}">
          ${t.type === 'income' ? '↑' : '↓'}
        </div>
        <div class="transaction-details">
          <h4>${t.description || t.category?.name || 'Transaction'}</h4>
          <p>${formatDate(t.date)} • ${t.category?.name || 'Uncategorized'}${t.isRefund ? ' (Refund)' : ''}</p>
        </div>
        <div class="transaction-amount ${t.type}">
          ${t.type === 'income' ? '+' : t.isRefund ? '+' : '-'}${formatCurrency(t.amount)}
        </div>
        <div class="transaction-actions">
          <button onclick="editTransaction('${t.id}')" class="btn btn-sm btn-outline">Edit</button>
          <button onclick="deleteTransaction('${t.id}')" class="btn btn-sm btn-danger">Delete</button>
        </div>
      </div>
    `).join('');

    // Render pagination
    renderPagination(pagination);

  } catch (error) {
    showToast('Error loading transactions', 'error');
  }
}

function renderPagination(pagination) {
  const container = document.getElementById('transactions-pagination');
  
  if (pagination.pages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= pagination.pages; i++) {
    html += `<button class="${i === pagination.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  loadTransactions();
}

async function showAddTransaction() {
  const categories = await api('/categories');
  
  openModal('Add Transaction', `
    <form onsubmit="createTransaction(event)">
      <div class="form-group">
        <label>Type</label>
        <select id="tx-type" required onchange="filterTransactionCategories()">
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      <div class="form-group">
        <label>Amount</label>
        <input type="number" id="tx-amount" step="0.01" required placeholder="0.00">
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="tx-category">
          <option value="">Select category</option>
          ${categories.data.map(c => `<option value="${c.id}" data-type="${c.type}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="tx-description" placeholder="What was this for?">
      </div>
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="tx-date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="form-group">
        <label><input type="checkbox" id="tx-refund"> This is a refund</label>
      </div>
      <button type="submit" class="btn btn-primary">Add Transaction</button>
    </form>
  `);
  
  filterTransactionCategories();
}

function filterTransactionCategories() {
  const type = document.getElementById('tx-type').value;
  const options = document.querySelectorAll('#tx-category option');
  
  options.forEach(opt => {
    if (opt.value === '' || opt.dataset.type === type) {
      opt.style.display = '';
    } else {
      opt.style.display = 'none';
    }
  });
  
  document.getElementById('tx-category').value = '';
}

async function createTransaction(e) {
  e.preventDefault();
  
  try {
    await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: document.getElementById('tx-type').value,
        amount: parseFloat(document.getElementById('tx-amount').value),
        categoryId: document.getElementById('tx-category').value || null,
        description: document.getElementById('tx-description').value,
        date: document.getElementById('tx-date').value,
        isRefund: document.getElementById('tx-refund').checked
      })
    });

    closeModal();
    showToast('Transaction added successfully');
    loadTransactions();
    loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function editTransaction(id) {
  try {
    const [txResponse, categories] = await Promise.all([
      api(`/transactions/${id}`),
      api('/categories')
    ]);
    
    const tx = txResponse.data;
    
    openModal('Edit Transaction', `
      <form onsubmit="updateTransaction(event, '${id}')">
        <div class="form-group">
          <label>Type</label>
          <select id="tx-type" disabled>
            <option value="expense" ${tx.type === 'expense' ? 'selected' : ''}>Expense</option>
            <option value="income" ${tx.type === 'income' ? 'selected' : ''}>Income</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount</label>
          <input type="number" id="tx-amount" step="0.01" required value="${tx.amount}">
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="tx-category">
            <option value="">Select category</option>
            ${categories.data.filter(c => c.type === tx.type).map(c => 
              `<option value="${c.id}" ${c.id === tx.category?.id ? 'selected' : ''}>${c.name}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" id="tx-description" value="${tx.description || ''}">
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="tx-date" value="${tx.date.split('T')[0]}">
        </div>
        <button type="submit" class="btn btn-primary">Update Transaction</button>
      </form>
    `);
  } catch (error) {
    showToast('Error loading transaction', 'error');
  }
}

async function updateTransaction(e, id) {
  e.preventDefault();
  
  try {
    await api(`/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        amount: parseFloat(document.getElementById('tx-amount').value),
        categoryId: document.getElementById('tx-category').value || null,
        description: document.getElementById('tx-description').value,
        date: document.getElementById('tx-date').value
      })
    });

    closeModal();
    showToast('Transaction updated successfully');
    loadTransactions();
    loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteTransaction(id) {
  if (!confirm('Are you sure you want to delete this transaction?')) return;
  
  try {
    await api(`/transactions/${id}`, { method: 'DELETE' });
    showToast('Transaction deleted successfully');
    loadTransactions();
    loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Categories
async function loadCategories() {
  try {
    const response = await api('/categories');
    const categories = response.data;

    const incomeCategories = categories.filter(c => c.type === 'income');
    const expenseCategories = categories.filter(c => c.type === 'expense');

    document.getElementById('income-categories').innerHTML = incomeCategories.length ? 
      incomeCategories.map(c => renderCategoryItem(c)).join('') :
      '<p style="color: #6b7280;">No income categories</p>';

    document.getElementById('expense-categories').innerHTML = expenseCategories.length ?
      expenseCategories.map(c => renderCategoryItem(c)).join('') :
      '<p style="color: #6b7280;">No expense categories</p>';

  } catch (error) {
    showToast('Error loading categories', 'error');
  }
}

function renderCategoryItem(category) {
  return `
    <div class="category-item">
      <div class="category-color" style="background: ${category.color}"></div>
      <span class="category-name">${category.name}</span>
      <div class="category-actions">
        <button onclick="editCategory('${category.id}')" class="btn btn-sm btn-outline">Edit</button>
        ${!category.isDefault ? `<button onclick="deleteCategory('${category.id}')" class="btn btn-sm btn-danger">Delete</button>` : ''}
      </div>
    </div>
  `;
}

function showAddCategory() {
  openModal('Add Category', `
    <form onsubmit="createCategory(event)">
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="cat-name" required placeholder="Category name">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="cat-type" required>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      <div class="form-group">
        <label>Color</label>
        <input type="color" id="cat-color" value="#6366f1">
      </div>
      <button type="submit" class="btn btn-primary">Add Category</button>
    </form>
  `);
}

async function createCategory(e) {
  e.preventDefault();
  
  try {
    await api('/categories', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('cat-name').value,
        type: document.getElementById('cat-type').value,
        color: document.getElementById('cat-color').value
      })
    });

    closeModal();
    showToast('Category added successfully');
    loadCategories();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function editCategory(id) {
  try {
    const response = await api(`/categories/${id}`);
    const cat = response.data;
    
    openModal('Edit Category', `
      <form onsubmit="updateCategory(event, '${id}')">
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="cat-name" required value="${cat.name}">
        </div>
        <div class="form-group">
          <label>Color</label>
          <input type="color" id="cat-color" value="${cat.color}">
        </div>
        <button type="submit" class="btn btn-primary">Update Category</button>
      </form>
    `);
  } catch (error) {
    showToast('Error loading category', 'error');
  }
}

async function updateCategory(e, id) {
  e.preventDefault();
  
  try {
    await api(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('cat-name').value,
        color: document.getElementById('cat-color').value
      })
    });

    closeModal();
    showToast('Category updated successfully');
    loadCategories();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteCategory(id) {
  if (!confirm('Are you sure you want to delete this category? Transactions will become uncategorized.')) return;
  
  try {
    await api(`/categories/${id}`, { method: 'DELETE' });
    showToast('Category deleted successfully');
    loadCategories();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Budgets
async function loadBudgets() {
  try {
    const [budgetsResponse, progressResponse] = await Promise.all([
      api('/budgets'),
      api('/budgets/progress')
    ]);

    const budgets = budgetsResponse.data;
    const progress = progressResponse.data;

    // Render progress summary
    document.getElementById('budget-progress').innerHTML = `
      <h3>Budget Overview</h3>
      <div class="budget-progress-summary">
        <div class="budget-progress-item">
          <h4>${formatCurrency(progress.summary.totalBudget)}</h4>
          <p>Total Budget</p>
        </div>
        <div class="budget-progress-item">
          <h4>${formatCurrency(progress.summary.totalSpent)}</h4>
          <p>Total Spent</p>
        </div>
        <div class="budget-progress-item">
          <h4>${formatCurrency(progress.summary.totalRemaining)}</h4>
          <p>Remaining</p>
        </div>
        <div class="budget-progress-item">
          <h4>${progress.summary.overallPercentage}%</h4>
          <p>Used</p>
        </div>
      </div>
    `;

    // Render budget list
    document.getElementById('budgets-list').innerHTML = budgets.length ?
      budgets.map(b => renderBudgetItem(b)).join('') :
      '<p style="color: #6b7280; text-align: center; padding: 40px;">No budgets set. Create one to start tracking!</p>';

  } catch (error) {
    showToast('Error loading budgets', 'error');
  }
}

function renderBudgetItem(budget) {
  const status = budget.percentage >= 100 ? 'exceeded' : budget.percentage >= budget.alertThreshold ? 'warning' : 'good';
  
  return `
    <div class="budget-item">
      <div class="budget-item-header">
        <h4>
          <span class="category-color" style="background: ${budget.category.color}"></span>
          ${budget.category.name}
        </h4>
        <span class="btn btn-sm btn-outline">${budget.period}</span>
      </div>
      <div class="budget-progress-bar">
        <div class="budget-progress-fill ${status}" style="width: ${Math.min(budget.percentage, 100)}%"></div>
      </div>
      <div class="budget-item-stats">
        <span>${formatCurrency(budget.spent)} of ${formatCurrency(budget.amount)}</span>
        <span>${budget.percentage.toFixed(0)}%</span>
      </div>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button onclick="editBudget('${budget.id}')" class="btn btn-sm btn-outline">Edit</button>
        <button onclick="deleteBudget('${budget.id}')" class="btn btn-sm btn-danger">Delete</button>
      </div>
    </div>
  `;
}

async function showAddBudget() {
  const categories = await api('/categories?type=expense');
  
  openModal('Add Budget', `
    <form onsubmit="createBudget(event)">
      <div class="form-group">
        <label>Category</label>
        <select id="budget-category" required>
          <option value="">Select category</option>
          ${categories.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Budget Amount</label>
        <input type="number" id="budget-amount" step="0.01" required placeholder="0.00">
      </div>
      <div class="form-group">
        <label>Period</label>
        <select id="budget-period" required>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="daily">Daily</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>
      <div class="form-group">
        <label>Alert Threshold (%)</label>
        <input type="number" id="budget-threshold" min="0" max="100" value="80">
      </div>
      <button type="submit" class="btn btn-primary">Create Budget</button>
    </form>
  `);
}

async function createBudget(e) {
  e.preventDefault();
  
  try {
    await api('/budgets', {
      method: 'POST',
      body: JSON.stringify({
        categoryId: document.getElementById('budget-category').value,
        amount: parseFloat(document.getElementById('budget-amount').value),
        period: document.getElementById('budget-period').value,
        alertThreshold: parseInt(document.getElementById('budget-threshold').value)
      })
    });

    closeModal();
    showToast('Budget created successfully');
    loadBudgets();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function editBudget(id) {
  try {
    const response = await api(`/budgets/${id}`);
    const budget = response.data;
    
    openModal('Edit Budget', `
      <form onsubmit="updateBudget(event, '${id}')">
        <div class="form-group">
          <label>Category</label>
          <input type="text" value="${budget.category.name}" disabled>
        </div>
        <div class="form-group">
          <label>Budget Amount</label>
          <input type="number" id="budget-amount" step="0.01" required value="${budget.amount}">
        </div>
        <div class="form-group">
          <label>Alert Threshold (%)</label>
          <input type="number" id="budget-threshold" min="0" max="100" value="${budget.alertThreshold}">
        </div>
        <button type="submit" class="btn btn-primary">Update Budget</button>
      </form>
    `);
  } catch (error) {
    showToast('Error loading budget', 'error');
  }
}

async function updateBudget(e, id) {
  e.preventDefault();
  
  try {
    await api(`/budgets/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        amount: parseFloat(document.getElementById('budget-amount').value),
        alertThreshold: parseInt(document.getElementById('budget-threshold').value)
      })
    });

    closeModal();
    showToast('Budget updated successfully');
    loadBudgets();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteBudget(id) {
  if (!confirm('Are you sure you want to delete this budget?')) return;
  
  try {
    await api(`/budgets/${id}`, { method: 'DELETE' });
    showToast('Budget deleted successfully');
    loadBudgets();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Reports
function initReportSelects() {
  const monthSelect = document.getElementById('report-month');
  const yearSelect = document.getElementById('report-year');
  const currentDate = new Date();
  
  // Populate months
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  monthSelect.innerHTML = months.map((m, i) => 
    `<option value="${i + 1}" ${i === currentDate.getMonth() ? 'selected' : ''}>${m}</option>`
  ).join('');
  
  // Populate years
  for (let y = currentDate.getFullYear(); y >= currentDate.getFullYear() - 5; y--) {
    yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
  }
}

function changeReportType() {
  const type = document.getElementById('report-type').value;
  
  document.getElementById('report-month-group').classList.toggle('hidden', type === 'yearly' || type === 'custom');
  document.getElementById('report-year-group').classList.toggle('hidden', type === 'custom');
  document.getElementById('report-start-group').classList.toggle('hidden', type !== 'custom');
  document.getElementById('report-end-group').classList.toggle('hidden', type !== 'custom');
}

async function generateReport() {
  try {
    const type = document.getElementById('report-type').value;
    let endpoint = '/reports/';
    let query = '';
    
    if (type === 'monthly') {
      endpoint += 'monthly';
      query = `?month=${document.getElementById('report-month').value}&year=${document.getElementById('report-year').value}`;
    } else if (type === 'yearly') {
      endpoint += 'yearly';
      query = `?year=${document.getElementById('report-year').value}`;
    } else {
      endpoint += 'custom';
      query = `?startDate=${document.getElementById('report-start').value}&endDate=${document.getElementById('report-end').value}`;
    }
    
    const response = await api(endpoint + query);
    renderReport(response.data);
    
  } catch (error) {
    showToast('Error generating report', 'error');
  }
}

function renderReport(data) {
  const container = document.getElementById('report-content');
  
  container.innerHTML = `
    <h3>${data.period.label || `${data.period.startDate} to ${data.period.endDate}`}</h3>
    
    <div class="report-summary">
      <div class="report-summary-item">
        <h4>Total Income</h4>
        <p style="color: #22c55e">${formatCurrency(data.summary.totalIncome)}</p>
      </div>
      <div class="report-summary-item">
        <h4>Total Expenses</h4>
        <p style="color: #ef4444">${formatCurrency(data.summary.totalExpenses)}</p>
      </div>
      <div class="report-summary-item">
        <h4>Refunds</h4>
        <p>${formatCurrency(data.summary.totalRefunds || 0)}</p>
      </div>
      <div class="report-summary-item">
        <h4>Net Savings</h4>
        <p style="color: #6366f1">${formatCurrency(data.summary.netSavings)}</p>
      </div>
      <div class="report-summary-item">
        <h4>Savings Rate</h4>
        <p>${data.summary.savingsRate}%</p>
      </div>
      <div class="report-summary-item">
        <h4>Transactions</h4>
        <p>${data.summary.transactionCount}</p>
      </div>
    </div>
    
    ${data.incomeByCategory ? `
      <div class="report-category-list">
        <h4>Income by Category</h4>
        ${data.incomeByCategory.map(c => `
          <div class="report-category-item">
            <div class="report-category-color" style="background: ${c.color}"></div>
            <span class="report-category-name">${c.name}</span>
            <span class="report-category-amount">${formatCurrency(c.amount)}</span>
            <span class="report-category-percent">${c.percentage}%</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    ${data.expenseByCategory ? `
      <div class="report-category-list">
        <h4>Expenses by Category</h4>
        ${data.expenseByCategory.map(c => `
          <div class="report-category-item">
            <div class="report-category-color" style="background: ${c.color}"></div>
            <span class="report-category-name">${c.name}</span>
            <span class="report-category-amount">${formatCurrency(c.amount)}</span>
            <span class="report-category-percent">${c.percentage}%</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

async function exportReport() {
  const type = document.getElementById('report-type').value;
  let startDate, endDate;
  
  if (type === 'monthly') {
    const year = document.getElementById('report-year').value;
    const month = document.getElementById('report-month').value;
    startDate = `${year}-${month.padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${month.padStart(2, '0')}-${lastDay}`;
  } else if (type === 'yearly') {
    const year = document.getElementById('report-year').value;
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  } else {
    startDate = document.getElementById('report-start').value;
    endDate = document.getElementById('report-end').value;
  }
  
  window.open(`${API_URL}/reports/export?startDate=${startDate}&endDate=${endDate}&format=csv&token=${token}`, '_blank');
}

// Modal
function openModal(title, content) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

// Close modal on outside click
document.getElementById('modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal') {
    closeModal();
  }
});

// Utility Functions
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// ============================================
// AI Assistant Functions
// ============================================
async function loadAIInsights() {
  const insightsContent = document.getElementById('ai-insights-content');
  insightsContent.innerHTML = '<div class="ai-content loading"><i class="fas fa-spinner fa-spin"></i> Loading insights...</div>';
  
  try {
    const data = await api('/ai/insights');
    insightsContent.innerHTML = `<div class="ai-content">${data.insights}</div>`;
  } catch (error) {
    insightsContent.innerHTML = `<div class="ai-content">Unable to load insights. ${error.message}</div>`;
  }
}

async function getAIReport() {
  const reportContent = document.getElementById('ai-report-content');
  reportContent.innerHTML = '<div class="ai-content loading"><i class="fas fa-spinner fa-spin"></i> Generating report...</div>';
  
  try {
    const data = await api('/ai/report');
    reportContent.innerHTML = `<div class="ai-content">${data.report}</div>`;
  } catch (error) {
    reportContent.innerHTML = `<div class="ai-content">Unable to generate report. ${error.message}</div>`;
  }
}

async function getAIBudgetRecommendations() {
  const budgetContent = document.getElementById('ai-budget-content');
  budgetContent.innerHTML = '<div class="ai-content loading"><i class="fas fa-spinner fa-spin"></i> Analyzing budgets...</div>';
  
  try {
    const data = await api('/ai/budget-recommendations');
    budgetContent.innerHTML = `<div class="ai-content">${data.recommendations}</div>`;
  } catch (error) {
    budgetContent.innerHTML = `<div class="ai-content">Unable to get recommendations. ${error.message}</div>`;
  }
}

async function sendAIChat() {
  const input = document.getElementById('ai-chat-input');
  const message = input.value.trim();
  if (!message) return;
  
  const chatMessages = document.getElementById('ai-chat-messages');
  
  // Add user message
  chatMessages.innerHTML += `<div class="chat-message user">${escapeHtml(message)}</div>`;
  input.value = '';
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Add loading message
  const loadingId = 'loading-' + Date.now();
  chatMessages.innerHTML += `<div class="chat-message assistant" id="${loadingId}"><i class="fas fa-spinner fa-spin"></i> Thinking...</div>`;
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  try {
    const data = await api('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
    
    // Replace loading with response
    document.getElementById(loadingId).innerHTML = data.response;
  } catch (error) {
    document.getElementById(loadingId).innerHTML = `Sorry, I encountered an error: ${error.message}`;
  }
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Import Functions
// ============================================
function initializeImportSection() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  
  if (!uploadArea || !fileInput) return;
  
  // Drag and drop handlers
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });
  
  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initializeImportSection, 500);
});

let selectedFile = null;

function handleFileSelect(file) {
  const validTypes = ['text/csv', 'application/pdf', 'application/vnd.ms-excel'];
  const validExtensions = ['.csv', '.pdf'];
  
  const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  
  if (!validExtensions.includes(extension)) {
    showToast('Please upload a CSV or PDF file', 'error');
    return;
  }
  
  selectedFile = file;
  const uploadArea = document.getElementById('upload-area');
  uploadArea.innerHTML = `
    <i class="fas fa-file-check"></i>
    <p><strong>${file.name}</strong></p>
    <span>${(file.size / 1024).toFixed(2)} KB</span>
  `;
  
  showToast('File selected. Click "Import Statement" to process.', 'success');
}

async function importStatement() {
  if (!selectedFile) {
    showToast('Please select a file first', 'error');
    return;
  }
  
  const formData = new FormData();
  formData.append('statement', selectedFile);
  
  const resultsDiv = document.getElementById('import-results');
  resultsDiv.innerHTML = '<p style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Processing...</p>';
  
  try {
    const response = await fetch(`${API_URL}/import/statement`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Import failed');
    }
    
    const { imported, duplicates, errors, transactions } = data;
    
    resultsDiv.innerHTML = `
      <h3>Import Results</h3>
      <div class="import-stats">
        <div class="import-stat success">
          <div class="stat-value">${imported}</div>
          <div class="stat-label">Imported</div>
        </div>
        <div class="import-stat duplicate">
          <div class="stat-value">${duplicates}</div>
          <div class="stat-label">Duplicates</div>
        </div>
        <div class="import-stat error">
          <div class="stat-value">${errors}</div>
          <div class="stat-label">Errors</div>
        </div>
        <div class="import-stat">
          <div class="stat-value">${imported + duplicates}</div>
          <div class="stat-label">Total Processed</div>
        </div>
      </div>
      ${transactions && transactions.length > 0 ? `
        <h4>Imported Transactions</h4>
        <div class="transactions-list">
          ${transactions.slice(0, 10).map(t => `
            <div class="transaction-item ${t.type}">
              <div class="transaction-icon">
                <i class="fas ${t.type === 'income' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
              </div>
              <div class="transaction-details">
                <h4>${t.description}</h4>
                <p>${t.category || 'Uncategorized'} • ${formatDate(t.date)}</p>
              </div>
              <div class="transaction-amount">${t.type === 'income' ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}</div>
            </div>
          `).join('')}
          ${transactions.length > 10 ? `<p style="text-align: center; color: #64748b;">And ${transactions.length - 10} more...</p>` : ''}
        </div>
      ` : ''}
    `;
    
    showToast(`Successfully imported ${imported} transactions`, 'success');
    
    // Reset upload area
    selectedFile = null;
    document.getElementById('upload-area').innerHTML = `
      <i class="fas fa-cloud-upload-alt"></i>
      <p>Drag & drop your bank statement here</p>
      <span>or click to browse (CSV, PDF)</span>
    `;
    
  } catch (error) {
    resultsDiv.innerHTML = `<p style="color: #dc2626;">Error: ${error.message}</p>`;
    showToast('Import failed: ' + error.message, 'error');
  }
}

// ============================================
// Anomaly Detection Functions
// ============================================
async function loadAnomalies() {
  const container = document.getElementById('anomaly-list');
  const summaryCards = document.querySelectorAll('.anomaly-summary-card .count');
  
  container.innerHTML = '<p style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Detecting anomalies...</p>';
  
  try {
    const data = await api('/anomalies');
    
    if (!data.anomalies || data.anomalies.length === 0) {
      container.innerHTML = `
        <div class="no-anomalies">
          <i class="fas fa-check-circle"></i>
          <h3>No Anomalies Detected</h3>
          <p>Your recent spending patterns look normal.</p>
        </div>
      `;
      summaryCards.forEach(card => card.textContent = '0');
      return;
    }
    
    // Count by type
    const counts = {
      unusual_amount: 0,
      frequency: 0,
      category_spike: 0,
      timing: 0,
      duplicate: 0
    };
    
    data.anomalies.forEach(a => {
      if (counts.hasOwnProperty(a.type)) {
        counts[a.type]++;
      }
    });
    
    // Update summary cards
    document.querySelector('.anomaly-summary-card.unusual-amount .count').textContent = counts.unusual_amount;
    document.querySelector('.anomaly-summary-card.frequency .count').textContent = counts.frequency;
    document.querySelector('.anomaly-summary-card.category-spike .count').textContent = counts.category_spike;
    document.querySelector('.anomaly-summary-card.timing .count').textContent = counts.timing;
    document.querySelector('.anomaly-summary-card.duplicate .count').textContent = counts.duplicate;
    
    // Render anomaly list
    container.innerHTML = data.anomalies.map(anomaly => `
      <div class="anomaly-item ${anomaly.type.replace('_', '-')}">
        <div class="anomaly-icon">
          <i class="fas ${getAnomalyIcon(anomaly.type)}"></i>
        </div>
        <div class="anomaly-info">
          <h4>${anomaly.description || 'Unknown Transaction'}</h4>
          <p>${anomaly.reason}</p>
        </div>
        <div class="anomaly-amount">${formatCurrency(anomaly.amount || 0)}</div>
      </div>
    `).join('');
    
  } catch (error) {
    container.innerHTML = `<p style="color: #dc2626;">Error loading anomalies: ${error.message}</p>`;
  }
}

function getAnomalyIcon(type) {
  const icons = {
    unusual_amount: 'fa-exclamation-triangle',
    frequency: 'fa-clock',
    category_spike: 'fa-chart-line',
    timing: 'fa-calendar-exclamation',
    duplicate: 'fa-copy'
  };
  return icons[type] || 'fa-question';
}

async function detectAnomalies() {
  await loadAnomalies();
}

