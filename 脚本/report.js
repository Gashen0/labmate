/**
 * 页面保护：检查是否存在原始数据，不存在则跳转到上传页
 * @returns {void}
 */
if (!localStorage.getItem('labmate_raw_data')) {
    window.location.href = '../页面/upload.html';
}

/**
 * 从 localStorage 读取的统计数据对象
 * @type {Object}
 */
const stats = JSON.parse(localStorage.getItem('labmate_stats') || '{}');

/**
 * 从 localStorage 读取的 AI 分析结论对象
 * @type {Object}
 */
const conclusions = JSON.parse(localStorage.getItem('labmate_ai_conclusions') || '{}');

// ---- 报告头信息初始化 ----

/**
 * 设置报告文件名显示
 * @type {void}
 */
document.getElementById('rptFilename').textContent = '文件: ' + (localStorage.getItem('labmate_filename') || '--');

/**
 * 上传时间字符串
 * @type {string|null}
 */
const uploadTime = localStorage.getItem('labmate_upload_time');

/**
 * 设置报告生成时间显示
 * @type {void}
 */
document.getElementById('rptTime').textContent = uploadTime ? '生成时间: ' + new Date(uploadTime).toLocaleString('zh-CN') : '';

/**
 * 设置页脚时间显示
 * @type {void}
 */
document.getElementById('footerTime').textContent = new Date().toLocaleString('zh-CN');

// ---- 数据概览 ----

/**
 * 从 localStorage 读取的原始数据二维数组
 * @type {Array<Array>}
 */
const rawData = JSON.parse(localStorage.getItem('labmate_raw_data') || '[]');

/**
 * 设置数据行数（减去表头行）
 * @type {void}
 */
document.getElementById('rptRows').textContent = Math.max(0, rawData.length - 1);

/**
 * 设置数据列数
 * @type {void}
 */
document.getElementById('rptCols').textContent = (stats.headers || []).length;

/**
 * 设置数值列数
 * @type {void}
 */
document.getElementById('rptNumCols').textContent = (stats.numericCols || []).length;

/**
 * 设置文件大小显示
 * @type {void}
 */
document.getElementById('rptSize').textContent = localStorage.getItem('labmate_filesize') || '--';

// ---- 统计表 ----

/**
 * 统计表的 tbody 元素引用
 * @type {HTMLTableSectionElement}
 */
const tbody = document.querySelector('#statsTable tbody');

/**
 * 遍历数值列，为每列生成一行统计数据并插入表格
 * @param {Object} col - 数值列信息对象
 * @param {string} col.name - 列名
 * @param {Object} col.stats - 该列的统计信息
 * @param {number} col.stats.mean - 均值
 * @param {number} col.stats.std - 标准差
 * @param {number} col.stats.min - 最小值
 * @param {number} col.stats.max - 最大值
 * @param {number} col.stats.median - 中位数
 * @param {number} col.stats.cv - 变异系数（百分比）
 * @returns {void}
 */
(stats.numericCols || []).forEach(col => {
    const s = col.stats;
    if (!s) return;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + col.name + '</td><td>' + s.mean.toFixed(4) + '</td><td>' + s.std.toFixed(4) + '</td><td>' + s.min.toFixed(4) + '</td><td>' + s.max.toFixed(4) + '</td><td>' + s.median.toFixed(4) + '</td><td>' + s.cv.toFixed(1) + '</td>';
    tbody.appendChild(tr);
});

// ---- 图表（折线图） ----

/**
 * 表头列名数组
 * @type {string[]}
 */
const headers = stats.headers || [];

/**
 * 数值列信息数组
 * @type {Object[]}
 */
const numericCols = stats.numericCols || [];

/**
 * 初始化 ECharts 折线图：当存在数值列且数据多于一行时，渲染折线图
 * @param {Object} col - 数值列信息
 * @param {string} col.name - 列名
 * @param {number} idx - 列在数组中的索引
 * @returns {Object} ECharts series 配置对象
 */
if (numericCols.length > 0 && rawData.length > 1) {
    const chart = echarts.init(document.getElementById('reportChart'), null, { renderer: 'canvas' });
    const colors = ['#2563eb', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
    const series = numericCols.slice(0, 4).map((col, idx) => {
        // 从原始数据提取该列值
        const colIdx = headers.indexOf(col.name);
        const vals = [];
        for (let r = 1; r < rawData.length; r++) {
            const v = parseFloat(rawData[r][colIdx]);
            if (!isNaN(v)) vals.push(v);
        }
        return {
            name: col.name, type: 'line', data: vals, smooth: true, symbol: 'circle', symbolSize: 5,
            lineStyle: { width: 2.5, color: colors[idx % colors.length] },
            itemStyle: { color: colors[idx % colors.length] },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: colors[idx % colors.length] + '33' }, { offset: 1, color: colors[idx % colors.length] + '03' }] } }
        };
    });
    chart.setOption({
        tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 13 } },
        legend: { data: numericCols.slice(0, 4).map(c => c.name), bottom: 0, textStyle: { color: '#64748b' } },
        grid: { top: 20, right: 20, bottom: 40, left: 50 },
        xAxis: { type: 'category', data: Array.from({length: series[0].data.length}, (_, i) => i + 1), name: '样本序号', axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b' }, axisTick: { show: false } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLabel: { color: '#64748b' }, axisLine: { show: false } },
        series: series
    });
    window.addEventListener('resize', () => chart.resize());
}

// ---- 结论渲染 ----

/**
 * AI 标识徽章元素引用
 * @type {HTMLElement}
 */
var rptAiBadge = document.getElementById('rptAiBadge');

/**
 * 结论分段的渲染顺序
 * @type {string[]}
 */
var order = ['type', 'method', 'analysis', 'quality', 'suggestion'];

/**
 * 各结论分段的标题和 CSS 类名映射
 * @type {Object.<string, {title: string, className: string}>}
 */
var secNames = {
    type: { title: '实验类型识别', className: 'type-section' },
    method: { title: '推荐分析方法', className: 'method-section' },
    analysis: { title: '数据分析', className: 'analysis-section' },
    quality: { title: '数据质量评估', className: 'quality-section' },
    suggestion: { title: '实验建议', className: 'suggestion-section' }
};

/**
 * 各结论分段对应的 SVG 图标 HTML
 * @type {Object.<string, string>}
 */
var icons = {
    type: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    method: '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
    analysis: '<svg viewBox="0 0 24 24"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>',
    quality: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    suggestion: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
};

/**
 * 渲染 AI 分析结论（支持新格式、旧格式和无数据三种情况）
 * @returns {void}
 */
if (conclusions.sections) {
    // 新格式：结构化分段
    var rptDiv = document.getElementById('rptConclusions');
    rptDiv.innerHTML = '';
    order.forEach(function(key) {
        if (conclusions.sections[key]) {
            var sec = document.createElement('div');
            sec.className = 'report-section ' + secNames[key].className;
            sec.innerHTML = '<div class="report-section-title"><div class="report-section-icon">' + icons[key] + '</div>' + secNames[key].title + '</div><div class="report-section-body">' + conclusions.sections[key].replace(/\n/g, '<br>') + '</div>';
            rptDiv.appendChild(sec);
        }
    });
    rptAiBadge.textContent = conclusions.isAI ? 'AI 深度分析' : '统计分析引擎';
} else if (conclusions.items && conclusions.items.length > 0) {
    // 旧格式兼容
    var rptDiv = document.getElementById('rptConclusions');
    rptDiv.innerHTML = '<ul class="conclusion-list" style="list-style:none;">' + conclusions.items.map(function(t) { return '<li style="padding:14px 0;border-bottom:1px solid var(--border);font-size:14px;line-height:1.8;display:flex;gap:10px;"><span style="width:8px;height:8px;min-width:8px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);margin-top:8px;"></span><span>' + t + '</span></li>'; }).join('') + '</ul>';
    rptAiBadge.textContent = conclusions.isAI ? 'AI 深度分析' : '统计分析引擎';
} else {
    document.getElementById('rptSec_type').style.display = '';
    document.getElementById('rptBody_type').innerHTML = '暂无分析结论，请返回分析页重新分析。';
}

// ---- PDF 导出 ----

/**
 * 导出报告为 PDF 文件
 * 使用 html2pdf.js 将报告内容区域渲染为 A4 纵向 PDF
 * @returns {void}
 */
function exportPDF() {
    const el = document.getElementById('reportContent');
    html2pdf().set({
        margin: [12, 12, 12, 12],
        filename: 'LabMate_实验报告_' + new Date().toISOString().slice(0, 10) + '.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#f8fafc' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
}