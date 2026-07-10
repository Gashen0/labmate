        // ===== AI 配置 =====
        // 使用方法：在 localStorage 中设置 labmate_api_key 存入你的 API Key
        // 或直接在此处替换 YOUR_API_KEY_HERE 为你的 Key（注意不要提交到公开仓库）
        const AI_CONFIG = {
            url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            get apiKey() {
                // 优先从 localStorage 读取（安全方式）
                return localStorage.getItem('labmate_api_key') || 'YOUR_API_KEY_HERE';
            },
            model: 'doubao-seed-2-0-lite-260428'
        };

        // ===== 实验类型识别（本地数据特征检测）=====
        /**
         * 根据列名和统计特征检测实验类型
         * @returns {Array<{type: string, confidence: string, reason: string}>} 匹配到的实验类型列表
         */
        function detectExperimentType() {
            const colNames = headers.map(h => h.toLowerCase());
            const patterns = [];

            // 标准曲线：浓度/含量 + 吸光度/荧光/响应
            const concKeywords = ['浓度', 'concentration', '含量', '标样', 'standard'];
            const responseKeywords = ['吸光度', 'absorbance', '荧光', 'fluorescence', '响应', 'response', 'od', '透光率'];
            const hasConc = colNames.some(n => concKeywords.some(k => n.includes(k)));
            const hasResponse = colNames.some(n => responseKeywords.some(k => n.includes(k)));
            if (hasConc && hasResponse) patterns.push({ type: '标准曲线/校准曲线', confidence: '高', reason: '检测到浓度列与响应信号列，符合朗伯-比尔定律标定实验特征' });

            // 酶动力学：pH/底物浓度 + 酶活性/反应速率
            const enzymeKeywords = ['酶', 'enzyme', '活性', 'activity', 'u/mg'];
            const phKeywords = ['ph', '酸碱'];
            const substrateKeywords = ['底物', 'substrate', 'mmol'];
            const hasEnzyme = colNames.some(n => enzymeKeywords.some(k => n.includes(k)));
            const hasPH = colNames.some(n => phKeywords.some(k => n.includes(k)));
            const hasSubstrate = colNames.some(n => substrateKeywords.some(k => n.includes(k)));
            if (hasEnzyme && (hasPH || hasSubstrate)) patterns.push({ type: '酶动力学实验', confidence: hasPH && hasSubstrate ? '高' : '中', reason: '检测到酶活性与' + (hasPH ? 'pH' : '') + (hasPH && hasSubstrate ? '/' : '') + (hasSubstrate ? '底物浓度' : '') + '变量，符合酶学性质研究特征' });

            // 温度效应：温度 + 速率/产率
            const tempKeywords = ['温度', 'temperature', '°c', '℃'];
            const rateKeywords = ['速率', 'rate', '产率', 'yield', '效率', 'efficiency'];
            const hasTemp = colNames.some(n => tempKeywords.some(k => n.includes(k)));
            const hasRate = colNames.some(n => rateKeywords.some(k => n.includes(k)));
            if (hasTemp && hasRate) patterns.push({ type: '温度效应实验', confidence: '高', reason: '检测到温度变量与反应速率/产率，符合反应动力学温度依赖性研究特征' });

            // 时间序列
            const timeKeywords = ['时间', 'time', 'min', 'hour', '小时', '分钟', 'day', '天'];
            const hasTime = colNames.some(n => timeKeywords.some(k => n.includes(k)));
            if (hasTime && numericCols.length >= 2) patterns.push({ type: '时间序列实验', confidence: '中', reason: '检测到时间变量与' + (numericCols.length - 1) + '个观测指标，符合动态监测实验特征' });

            // 多因素设计
            if (numericCols.length >= 3 && !hasTime && !hasConc) {
                patterns.push({ type: '多因素实验', confidence: '低', reason: '多个数值变量但未匹配到典型实验模式，可能是自定义实验设计' });
            }

            if (patterns.length === 0 && numericCols.length >= 2) {
                patterns.push({ type: '通用实验数据', confidence: '低', reason: '未匹配到已知实验模式，将进行通用统计分析' });
            }

            // 检查变量独立性：如果两列r=1.0，说明完全耦合
            if (bestRegression && Math.abs(bestRegression.r) > 0.999) {
                patterns.push({ type: '⚠ 变量耦合警告', confidence: '高', reason: '「' + bestRegression.colA + '」与「' + bestRegression.colB + '」的相关系数r≈1.0，这两个变量完全线性耦合，无法区分各自效应。实验设计可能存在控制变量法缺失。' });
            }

            return patterns;
        }

        // ===== AI 打字机效果 =====
        /**
         * 在指定容器中以打字机效果逐字显示文本
         * @param {HTMLElement} container - 目标 DOM 容器
         * @param {string} text - 要显示的文本内容
         * @param {number} [speed=15] - 每个字符的打字间隔（毫秒）
         * @returns {Promise<void>} 文本显示完成后 resolve
         */
        function typewriterEffect(container, text, speed) {
            return new Promise(function(resolve) {
                container.innerHTML = '';
                let i = 0;
                const sp = speed || 15;
                function type() {
                    if (i < text.length) {
                        container.innerHTML += text.charAt(i);
                        i++;
                        setTimeout(type, sp);
                    } else {
                        resolve();
                    }
                }
                type();
            });
        }

        /**
         * 调用豆包 AI 接口进行实验数据分析
         * @param {{summary: string, stats: string, preliminaryTypes: string}} context - 包含数据摘要、统计结果和预判实验类型的上下文
         * @returns {Promise<string>} AI 返回的分析文本
         */
        async function callDoubaoAI(context) {
            const systemPrompt = '你是一位资深实验数据分析专家，拥有化学、生物学、材料科学和物理学实验的深厚领域知识。\n\n' +
                '你的分析流程：\n' +
                '1. 首先判断这是什么类型的实验（标准曲线？酶动力学？温度效应？时间序列？多因素？）\n' +
                '2. 根据实验类型，推荐最适合的分析方法，并解释为什么\n' +
                '3. 用推荐的方法分析数据，给出具体结论\n' +
                '4. 评估数据质量，指出潜在问题\n' +
                '5. 给出可操作的实验改进建议\n\n' +
                '领域知识参考：\n' +
                '- 标准曲线：用线性回归评估，R²>0.99为优秀，R²>0.95为可接受。关注残差分布和检测限（LOD=3.3σ/S）。\n' +
                '- 酶动力学：pH-酶活性曲线通常呈钟形，用二次多项式或Gaussian拟合。Michaelis-Menten方程V=Vmax[S]/(Km+[S])用于底物浓度-反应速率。\n' +
                '- 温度效应：Arrhenius方程k=A·e^(-Ea/RT)，lnk对1/T作图。注意高温区酶失活导致的偏离。\n' +
                '- 时间序列：关注趋势、周期性、突变点。用移动平均平滑噪声。\n' +
                '- 多因素：主效应和交互效应都重要。如果两变量r≈1.0，说明完全耦合，无法分离各自效应——这是实验设计缺陷。\n\n' +
                '输出格式（严格按此结构）：\n' +
                '## 实验类型识别\n' +
                '[判断这是什么实验，给出判断依据]\n\n' +
                '## 推荐分析方法\n' +
                '[根据实验类型推荐2-3种分析方法，每种方法说明为什么适合]\n\n' +
                '## 数据分析\n' +
                '[用推荐的方法分析数据，引用具体数值]\n\n' +
                '## 数据质量评估\n' +
                '[离群点、数据分布、潜在问题]\n\n' +
                '## 实验建议\n' +
                '[2-3条可操作的改进建议，每条建议要具体]';

            const userPrompt = '请分析以下实验数据：\n\n' +
                '数据概览：' + context.summary + '\n\n' +
                '统计结果：' + context.stats + '\n\n' +
                '本地预判的实验类型：' + context.preliminaryTypes;

            const response = await fetch(AI_CONFIG.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + AI_CONFIG.apiKey
                },
                body: JSON.stringify({
                    model: AI_CONFIG.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.5,
                    max_tokens: 1200
                })
            });
            const result = await response.json();
            if (result.choices && result.choices[0]) {
                return result.choices[0].message.content;
            }
            throw new Error('AI 返回格式异常');
        }

        // ===== 全局状态 =====
        let rawData = null;
        let headers = [];
        let numericCols = [];
        let colStats = {};
        let correlations = [];
        let bestRegression = null;
        let outliers = [];
        let chart = null;
        let currentChart = 'line';
        let dynamicConclusions = { line: '', bar: '', scatter: '' };

        // ===== 统计引擎 =====
        /**
         * 计算一组数值的描述性统计量
         * @param {number[]} values - 数值数组
         * @returns {{n: number, mean: number, std: number, min: number, max: number, median: number, cv: number}|null} 统计结果对象，空数组返回 null
         */
        function computeStats(values) {
            const n = values.length;
            if (n === 0) return null;
            const mean = values.reduce((a, b) => a + b, 0) / n;
            const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
            const std = Math.sqrt(variance);
            // 避免 Math.min/max 对大数组栈溢出
            let min = values[0], max = values[0];
            for (let i = 1; i < n; i++) {
                if (values[i] < min) min = values[i];
                if (values[i] > max) max = values[i];
            }
            const sorted = values.slice().sort((a, b) => a - b);
            const mid = Math.floor(n / 2);
            const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
            const cv = mean !== 0 ? (std / Math.abs(mean) * 100) : 0;
            return { n, mean, std, min, max, median, cv };
        }

        /**
         * 计算两组数值的 Pearson 相关系数
         * @param {number[]} x - 第一组数值
         * @param {number[]} y - 第二组数值
         * @returns {number} 相关系数 r，取值范围 [-1, 1]
         */
        function pearsonCorrelation(x, y) {
            const n = Math.min(x.length, y.length);
            if (n < 2) return 0;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
            for (let i = 0; i < n; i++) {
                sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i];
                sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
            }
            const num = n * sumXY - sumX * sumY;
            const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
            return den === 0 ? 0 : num / den;
        }

        /**
         * 对两组数值进行线性回归分析
         * @param {number[]} x - 自变量数组
         * @param {number[]} y - 因变量数组
         * @returns {{slope: number, intercept: number, r2: number}} 回归结果，包含斜率、截距和决定系数 R²
         */
        function linearRegression(x, y) {
            const n = x.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (let i = 0; i < n; i++) {
                sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i]; sumX2 += x[i] * x[i];
            }
            const denom = n * sumX2 - sumX * sumX;
            if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };
            const slope = (n * sumXY - sumX * sumY) / denom;
            const intercept = (sumY - slope * sumX) / n;
            const meanY = sumY / n;
            let ssTotal = 0, ssResidual = 0;
            for (let i = 0; i < n; i++) {
                const pred = slope * x[i] + intercept;
                ssTotal += Math.pow(y[i] - meanY, 2);
                ssResidual += Math.pow(y[i] - pred, 2);
            }
            const r2 = ssTotal === 0 ? 1 : 1 - ssResidual / ssTotal;
            return { slope, intercept, r2 };
        }

        /**
         * 基于三倍标准差法则检测所有数值列中的离群点
         * @returns {Array<{row: number, col: string, value: number, deviation: string}>} 离群点列表
         */
        function detectOutliers() {
            const result = [];
            numericCols.forEach(col => {
                const stats = colStats[col.name];
                if (!stats || stats.std === 0) return;
                const threshold = 3 * stats.std;
                col.values.forEach((v, idx) => {
                    if (Math.abs(v - stats.mean) > threshold) {
                        result.push({
                            row: idx + 1, col: col.name, value: v,
                            deviation: ((v - stats.mean) / stats.std).toFixed(2)
                        });
                    }
                });
            });
            return result;
        }

        // ===== 数据处理 =====
        /**
         * 解析原始数据，提取表头、数值列，计算统计量、相关系数和离群点
         */
        function processData() {
            headers = rawData[0] || [];
            // 自动为缺失表头生成名称
            for (let i = 0; i < headers.length; i++) {
                if (!headers[i] || headers[i].toString().trim() === '') {
                    headers[i] = '列' + (i + 1);
                }
            }

            numericCols = [];
            for (let c = 0; c < headers.length; c++) {
                const values = [];
                for (let r = 1; r < rawData.length; r++) {
                    const v = parseFloat(rawData[r][c]);
                    if (!isNaN(v)) values.push(v);
                }
                if (values.length > 0) {
                    numericCols.push({ index: c, name: headers[c], values: values });
                }
            }

            // 计算每列统计
            numericCols.forEach(col => {
                colStats[col.name] = computeStats(col.values);
            });

            // 计算相关系数矩阵
            correlations = [];
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const r = pearsonCorrelation(numericCols[i].values, numericCols[j].values);
                    correlations.push({
                        colA: numericCols[i].name, colB: numericCols[j].name,
                        r: r, absR: Math.abs(r)
                    });
                }
            }
            correlations.sort((a, b) => b.absR - a.absR);

            // 找出最佳回归
            if (correlations.length > 0 && correlations[0].absR > 0.3) {
                const best = correlations[0];
                const colA = numericCols.find(c => c.name === best.colA);
                const colB = numericCols.find(c => c.name === best.colB);
                bestRegression = {
                    ...linearRegression(colA.values, colB.values),
                    colA: best.colA, colB: best.colB, r: best.r
                };
            }

            // 离群点检测
            outliers = detectOutliers();

            // 存储统计结果供报告页使用
            localStorage.setItem('labmate_stats', JSON.stringify({
                headers, numericCols: numericCols.map(c => ({ name: c.name, stats: colStats[c.name] })),
                correlations, bestRegression, outliers
            }));
        }

        // ===== 页面更新 =====
        /**
         * 更新页面顶部数据概览区域（行数、列数、数值列数、文件大小）
         */
        function updateOverview() {
            const dataRows = Math.max(0, rawData.length - 1);
            document.getElementById('overviewRows').textContent = dataRows;
            document.getElementById('overviewCols').textContent = headers.length;
            document.getElementById('overviewType').textContent = numericCols.length;
            document.getElementById('overviewSize').textContent = localStorage.getItem('labmate_filesize') || '--';
            document.getElementById('pageSubtitle').textContent =
                '已识别到 ' + headers.length + ' 列数据（' + numericCols.length + ' 列数值型），推荐以下分析方式';

            // 各列统计摘要
            renderColStatsSummary();
        }

        /**
         * 为每列数值数据生成一句话统计解读
         */
        function renderColStatsSummary() {
            if (!numericCols.length || !Object.keys(colStats).length) return;
            var card = document.getElementById('colStatsCard');
            var container = document.getElementById('colStatsSummary');
            var lines = numericCols.map(function(col) {
                var s = colStats[col.name];
                if (!s) return '';
                var cv = s.std === 0 ? 0 : (s.std / Math.abs(s.mean) * 100);
                var cvDesc = cv < 5 ? '数据集中' : cv < 15 ? '波动适中' : '离散较大';
                var range = s.max - s.min;
                return '<b>' + col.name + '</b>：均值 ' + s.mean.toFixed(3) +
                    '，标准差 ' + s.std.toFixed(3) +
                    '（变异系数 ' + cv.toFixed(1) + '%，' + cvDesc + '）' +
                    '，范围 [' + s.min.toFixed(3) + ', ' + s.max.toFixed(3) + ']';
            });
            container.innerHTML = lines.join('<br>');
            card.style.display = '';
        }

        // ===== 解析 AI 结构化响应 =====
        /**
         * 解析 AI 返回的 Markdown 文本，按章节拆分为结构化对象
         * @param {string} text - AI 返回的完整分析文本
         * @returns {{type?: string, method?: string, analysis?: string, quality?: string, suggestion?: string}} 按章节拆分的分析结果
         */
        function parseAIResponse(text) {
            var sections = {};
            // 尝试按 ## 分段（支持有无空格）
            var parts = text.split(/(?=##\s*)/);
            if (parts.length <= 1) {
                // 如果没有 ## 分段，尝试按 **粗体标题** 分段
                parts = text.split(/(?=\*\*[^*]+\*\*[\n\r]*)/);
            }
            parts.forEach(function(part) {
                // 尝试匹配 ## 标题 或 **标题**
                var match = part.match(/^(?:##\s*|\*\*)(.+?)(?:\*\*)?[\n\r]+([\s\S]*)/);
                if (!match) return;
                var title = match[1].trim().toLowerCase();
                var content = match[2].trim();
                if (title.includes('实验类型') || title.includes('类型识别')) {
                    sections.type = content;
                } else if (title.includes('推荐分析') || title.includes('分析方法') || title.includes('方法推荐')) {
                    sections.method = content;
                } else if (title.includes('数据分') && !title.includes('质量') && !title.includes('数据质量')) {
                    sections.analysis = content;
                } else if (title.includes('数据质量') || title.includes('质量评估')) {
                    sections.quality = content;
                } else if (title.includes('建议') || title.includes('改进')) {
                    sections.suggestion = content;
                }
            });
            // 如果没有任何分段被匹配，把整个文本放到 type 段
            if (!sections.type && !sections.method && !sections.analysis && !sections.quality && !sections.suggestion) {
                sections.type = text;
            }
            return sections;
        }

        // ===== 渲染结构化分段（含打字机效果）=====
        /**
         * 按顺序渲染各分析分段，带打字机动画效果
         * @param {{type?: string, method?: string, analysis?: string, quality?: string, suggestion?: string}} sections - 分析分段内容
         * @param {boolean} isAI - 是否为 AI 分析结果，用于设置标签显示
         * @returns {Promise<void>}
         */
        async function renderStructuredSections(sections, isAI) {
            var secIds = ['type', 'method', 'analysis', 'quality', 'suggestion'];
            secIds.forEach(function(id) {
                document.getElementById('aiSec_' + id).style.display = 'none';
            });
            document.getElementById('aiLoading').style.display = 'none';
            var tag = document.getElementById('aiTag');
            tag.style.display = 'inline-block';
            tag.textContent = isAI ? 'AI 深度分析' : '统计分析引擎';
            document.getElementById('reAnalysisBtn').style.display = '';

            var order = ['type', 'method', 'analysis', 'quality', 'suggestion'];
            for (var i = 0; i < order.length; i++) {
                var key = order[i];
                if (sections[key]) {
                    var sec = document.getElementById('aiSec_' + key);
                    var body = document.getElementById('aiBody_' + key);
                    sec.style.display = '';
                    body.innerHTML = '';
                    sec.style.animation = 'none';
                    sec.offsetHeight;
                    sec.style.animation = 'fadeInUp 0.4s ease backwards';
                    await typewriterEffect(body, sections[key], 10);
                }
            }
        }

        // ===== 本地降级分析（数据特征检测 + 领域知识规则）=====
        /**
         * 在 AI 不可用时，使用本地统计引擎生成分析结论
         * @returns {{type: string, method: string, analysis: string, quality: string, suggestion: string}} 本地分析的分段结论
         */
        function generateLocalFallback() {
            var sections = {};
            var types = detectExperimentType();
            sections.type = types.map(function(t) {
                return '• ' + t.type + '（置信度：' + t.confidence + '）\n  ' + t.reason;
            }).join('\n\n');
            if (!sections.type) sections.type = '通用实验数据，未匹配到特定实验类型。';

            sections.method = '• 描述性统计：查看各列均值、标准差、变异系数，了解数据分布特征\n• 相关性分析：Pearson相关系数矩阵，识别变量间线性关系\n';
            if (bestRegression) sections.method += '• 线性回归：对最强相关变量对建立回归模型，评估拟合优度R²';

            if (bestRegression) {
                sections.analysis = '「' + bestRegression.colA + '」与「' + bestRegression.colB + '」的Pearson相关系数 r=' + bestRegression.r.toFixed(3) + '，R²=' + bestRegression.r2.toFixed(3) + '。\n回归方程：y = ' + bestRegression.slope.toFixed(4) + 'x + ' + bestRegression.intercept.toFixed(4) + '。\n';
                sections.analysis += bestRegression.r2 > 0.9 ? '拟合优度极高，线性模型适用性良好。' : (bestRegression.r2 > 0.7 ? '拟合优度较高，可用于初步预测。' : '拟合优度一般，建议考虑非线性模型或增加实验因素。');
            } else if (numericCols.length > 0) {
                sections.analysis = '各列数值数据统计如下：\n' + numericCols.map(function(c) {
                    var s = colStats[c.name];
                    return '• ' + c.name + '：均值=' + s.mean.toFixed(3) + '，标准差=' + s.std.toFixed(3) + '，CV=' + s.cv.toFixed(1) + '%' + (s.cv < 10 ? '（数据稳定）' : (s.cv < 30 ? '（波动适中）' : '（离散较大）'));
                }).join('\n');
            }

            sections.quality = '';
            if (outliers.length > 0) {
                sections.quality += '检测到 ' + outliers.length + ' 个潜在离群点（3σ法则）：\n';
                var showOutliers = outliers.slice(0, 5);
                showOutliers.forEach(function(o) {
                    sections.quality += '• 第' + o.row + '行「' + o.col + '」=' + o.value.toFixed(3) + '（偏离' + o.deviation + 'σ）\n';
                });
                if (outliers.length > 5) sections.quality += '• ... 还有 ' + (outliers.length - 5) + ' 个离群点\n';
            } else {
                sections.quality = '未检测到离群点，数据分布较为集中，数据质量良好。';
            }
            if (bestRegression && Math.abs(bestRegression.r) > 0.999) {
                sections.quality += '\n变量耦合警告：「' + bestRegression.colA + '」与「' + bestRegression.colB + '」相关系数接近1.0，可能存在完全线性耦合，实验设计需注意控制变量。';
            }

            sections.suggestion = '';
            if (outliers.length > 0) {
                sections.suggestion = '• 复查离群点对应的原始实验记录，确认是否存在操作失误或仪器异常\n• 若离群点确认为异常值，在进一步分析前可考虑剔除或标记\n• 增加平行实验次数，提高数据可靠性';
            } else {
                sections.suggestion = '• 考虑增加实验重复次数，以降低随机误差\n• 如需更深入分析，建议上传包含更多变量维度的数据集\n• 可在报告页导出完整分析结果，用于实验报告撰写';
            }

            return sections;
        }

        // ===== 生成图表结论 =====
        /**
         * 根据回归结果和数值列情况，生成各图表类型的动态分析结论
         */
        function updateChartConclusions() {
            if (bestRegression) {
                dynamicConclusions.line = '趋势分析：各数值列整体变化趋势可通过折线图观察。「' + bestRegression.colA + '」与「' + bestRegression.colB + '」变化趋势' + (bestRegression.r > 0.5 ? '高度一致' : '存在差异') + '，建议结合具体实验条件进一步分析。';
                dynamicConclusions.bar = '对比分析：各列数据分布特征可通过柱状图对比。「' + bestRegression.colA + '」均值 ' + colStats[bestRegression.colA].mean.toFixed(3) + '，「' + bestRegression.colB + '」均值 ' + colStats[bestRegression.colB].mean.toFixed(3) + '，数据量级差异' + (Math.abs(colStats[bestRegression.colA].mean - colStats[bestRegression.colB].mean) / Math.max(colStats[bestRegression.colA].mean, colStats[bestRegression.colB].mean) < 0.3 ? '较小' : '明显') + '。';
                dynamicConclusions.scatter = '相关性分析：「' + bestRegression.colA + '」与「' + bestRegression.colB + '」的 Pearson 相关系数 r=' + bestRegression.r.toFixed(2) + '，R²=' + bestRegression.r2.toFixed(3) + '。数据点' + (bestRegression.r2 > 0.8 ? '集中在回归线附近，线性模型适用性高' : '分布较散，建议考虑非线性模型') + '。';
                dynamicConclusions.box = '分布分析：箱线图展示各列数据的五数概括（最小值、Q1、中位数、Q3、最大值）。关注中位数位置和箱体长度，箱体越长表示数据离散程度越大，可快速识别各列数据的分布特征和离群点。';
            } else if (numericCols.length >= 2) {
                dynamicConclusions.line = '趋势分析：各数值列可通过折线图观察变化趋势，建议关注数据波动较大的列。';
                dynamicConclusions.bar = '对比分析：各列数据分布特征不同，建议结合实验设计理解各变量的物理意义。';
                dynamicConclusions.scatter = '相关性分析：各列之间线性相关性较弱，建议检查数据采集的一致性或考虑其他分析方法。';
                dynamicConclusions.box = '分布分析：箱线图展示各列数据的分布特征和离散程度。通过比较中位数和四分位距(IQR)，可快速识别数据偏态和离群点。';
            } else {
                dynamicConclusions.line = '趋势分析：数据列数不足，无法绘制有意义的趋势图。';
                dynamicConclusions.bar = '对比分析：数据列数不足，无法进行有效的对比分析。';
                dynamicConclusions.scatter = '相关性分析：需要至少两列数值型数据才能进行相关性分析。';
                dynamicConclusions.box = '分布分析：箱线图展示单列数据的分布特征，包括中位数、四分位数和离群点。';
            }
            document.getElementById('conclusionText').textContent = dynamicConclusions.line;
        }

        // ===== AI 分析主流程 =====
        /**
         * AI 分析主流程：调用 AI 接口或降级到本地统计引擎，渲染分析结论
         * @returns {Promise<void>}
         */
        async function generateConclusions() {
            if (numericCols.length === 0) {
                document.getElementById('aiLoading').style.display = 'none';
                document.getElementById('aiSec_type').style.display = '';
                document.getElementById('aiBody_type').innerHTML = '未检测到数值型数据，无法进行 AI 分析。';
                document.getElementById('aiTag').style.display = 'inline-block';
                document.getElementById('aiTag').textContent = '数据不足';
                return;
            }

            // 先显示加载动画，隐藏分段
            document.getElementById('aiLoading').style.display = '';
            ['type', 'method', 'analysis', 'quality', 'suggestion'].forEach(function(id) {
                document.getElementById('aiSec_' + id).style.display = 'none';
            });
            document.getElementById('reAnalysisBtn').style.display = 'none';

            // 更新图表结论
            updateChartConclusions();

            // 构造统计摘要
            var dataSummary = (rawData.length - 1) + '行 × ' + headers.length + '列，数值列：' + numericCols.map(function(c) { return c.name; }).join('、');
            var statsText = '';
            numericCols.forEach(function(col) {
                var s = colStats[col.name];
                statsText += col.name + ': 均值=' + s.mean.toFixed(3) + ' 标准差=' + s.std.toFixed(3) + ' 范围=[' + s.min.toFixed(3) + ',' + s.max.toFixed(3) + '] CV=' + s.cv.toFixed(1) + '%; ';
            });
            if (bestRegression) {
                statsText += '最强相关: ' + bestRegression.colA + ' vs ' + bestRegression.colB + ' r=' + bestRegression.r.toFixed(3) + ' R²=' + bestRegression.r2.toFixed(3) + '; ';
            }
            if (outliers.length > 0) {
                statsText += '离群点: ' + outliers.map(function(o) { return '第' + o.row + '行' + o.col + '=' + o.value.toFixed(3) + '(' + o.deviation + 'σ)'; }).join('; ');
            } else {
                statsText += '离群点: 无(3σ法则);';
            }

            try {
                // 调用 AI（传入 context 对象）
                var aiText = await callDoubaoAI({
                    summary: dataSummary,
                    stats: statsText,
                    preliminaryTypes: JSON.stringify(detectExperimentType())
                });

                // 解析结构化响应
                var sections = parseAIResponse(aiText);

                // 渲染
                await renderStructuredSections(sections, true);

                // 存储
                localStorage.setItem('labmate_ai_conclusions', JSON.stringify({
                    sections: sections, chartConclusions: dynamicConclusions, isAI: true
                }));
            } catch (err) {
                console.warn('AI 调用失败，降级到本地统计引擎:', err);
                var fallbackSections = generateLocalFallback();
                await renderStructuredSections(fallbackSections, false);
                localStorage.setItem('labmate_ai_conclusions', JSON.stringify({
                    sections: fallbackSections, chartConclusions: dynamicConclusions, isAI: false
                }));
            }
        }

        // 重新分析
        /**
         * 重新触发 AI 分析流程
         */
        function reAnalysis() {
            generateConclusions();
        }

        // ===== 图表 =====
        /**
         * 初始化 ECharts 图表实例，绑定窗口缩放事件
         */
        function initChart() {
            const dom = document.getElementById('chartContainer');
            chart = echarts.init(dom, null, { renderer: 'canvas' });
            if (numericCols.length > 0) {
                renderChart('line');
            } else {
                chart.setOption({
                    title: { text: '未检测到数值型数据', left: 'center', top: 'center', textStyle: { color: '#94a3b8', fontSize: 16 } }
                });
            }
            window.addEventListener('resize', function() { chart && chart.resize(); });
        }

        /**
         * 切换图表类型，更新标签页激活状态和结论文本
         * @param {string} type - 图表类型（line/bar/scatter/box）
         */
        function switchChart(type) {
            currentChart = type;
            document.querySelectorAll('.chart-tab').forEach(function(tab) {
                tab.classList.toggle('active', tab.dataset.chart === type);
            });
            document.getElementById('conclusionText').textContent = dynamicConclusions[type];
            const container = document.getElementById('chartContainer');
            container.style.opacity = '0';
            container.style.transition = 'opacity 0.2s ease';
            setTimeout(function() {
                renderChart(type);
                container.style.opacity = '1';
            }, 200);
        }

        /**
         * 根据指定类型渲染 ECharts 图表（折线图、柱状图、散点图、箱线图）
         * @param {string} type - 图表类型（line/bar/scatter/box）
         */
        function renderChart(type) {
            if (numericCols.length === 0) return;
            const color = '#2563eb';
            const colors = ['#2563eb', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
            let option = {};

            if (type === 'line') {
                // 折线图：所有数值列
                const xData = [];
                for (let i = 1; i < rawData.length; i++) xData.push(i);
                const series = numericCols.slice(0, 4).map((col, idx) => ({
                    name: col.name,
                    type: 'line',
                    data: col.values,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { width: 2.5, color: colors[idx % colors.length] },
                    itemStyle: { color: colors[idx % colors.length], borderWidth: 2, borderColor: '#fff' },
                    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
                        { offset: 0, color: colors[idx % colors.length] + '33' },
                        { offset: 1, color: colors[idx % colors.length] + '03' }
                    ] } },
                    animationDuration: 1200,
                    animationEasing: 'cubicOut'
                }));
                option = {
                    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 13 }, padding: [12, 16] },
                    legend: { data: numericCols.slice(0, 4).map(c => c.name), top: 10, right: 10, textStyle: { color: '#64748b', fontSize: 13 } },
                    grid: { top: 50, right: 30, bottom: 40, left: 50 },
                    xAxis: { type: 'category', data: xData, name: '样本序号', nameTextStyle: { color: '#64748b', fontSize: 12 }, axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b' }, axisTick: { show: false } },
                    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLabel: { color: '#64748b' }, axisLine: { show: false }, axisTick: { show: false } },
                    series: series
                };
            } else if (type === 'bar') {
                // 柱状图：各列均值对比
                const barData = numericCols.map(col => ({
                    name: col.name,
                    value: colStats[col.name].mean
                }));
                option = {
                    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 13 }, padding: [12, 16], formatter: function(p) { return p[0].name + '<br>均值: ' + p[0].value.toFixed(4); } },
                    grid: { top: 30, right: 30, bottom: 60, left: 60 },
                    xAxis: { type: 'category', data: barData.map(d => d.name), axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b', rotate: numericCols.length > 5 ? 30 : 0 }, axisTick: { show: false } },
                    yAxis: { type: 'value', name: '均值', nameTextStyle: { color: '#64748b', fontSize: 12 }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLabel: { color: '#64748b' }, axisLine: { show: false }, axisTick: { show: false } },
                    series: [{
                        type: 'bar',
                        data: barData.map((d, i) => ({
                            value: d.value,
                            itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: colors[i % colors.length] }, { offset: 1, color: colors[i % colors.length] + '99' }] }, borderRadius: [6, 6, 0, 0] }
                        })),
                        barWidth: '40%',
                        animationDuration: 1000,
                        animationEasing: 'cubicOut'
                    }]
                };
            } else if (type === 'scatter') {
                // 散点图：最强相关的两列
                if (bestRegression) {
                    const colA = numericCols.find(c => c.name === bestRegression.colA);
                    const colB = numericCols.find(c => c.name === bestRegression.colB);
                    const scatterData = [];
                    for (let i = 0; i < Math.min(colA.values.length, colB.values.length); i++) {
                        scatterData.push([colA.values[i], colB.values[i]]);
                    }
                    option = {
                        tooltip: { trigger: 'item', backgroundColor: '#1e293b', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 13 }, padding: [12, 16],
                            formatter: function(p) { return bestRegression.colA + ': ' + p.data[0].toFixed(3) + '<br>' + bestRegression.colB + ': ' + p.data[1].toFixed(3); } },
                        grid: { top: 30, right: 30, bottom: 50, left: 60 },
                        xAxis: { type: 'value', name: bestRegression.colA, nameTextStyle: { color: '#64748b', fontSize: 13, padding: [10, 0, 0, 0] }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b' }, axisTick: { show: false } },
                        yAxis: { type: 'value', name: bestRegression.colB, nameTextStyle: { color: '#64748b', fontSize: 13 }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#64748b' } },
                        series: [
                            { type: 'scatter', data: scatterData, symbolSize: 14, itemStyle: { color: color, borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(37, 99, 235, 0.3)' }, animationDuration: 800, animationEasing: 'cubicOut' },
                            // 回归线
                            { type: 'line', data: (function() {
                                const xs = colA.values;
                                const minX = Math.min(...xs), maxX = Math.max(...xs);
                                return [[minX, bestRegression.slope * minX + bestRegression.intercept], [maxX, bestRegression.slope * maxX + bestRegression.intercept]];
                            })(), smooth: false, symbol: 'none', lineStyle: { width: 2, type: 'dashed', color: '#ef4444' }, silent: true }
                        ]
                    };
                } else if (numericCols.length >= 2) {
                    const colA = numericCols[0], colB = numericCols[1];
                    const scatterData = [];
                    for (let i = 0; i < Math.min(colA.values.length, colB.values.length); i++) {
                        scatterData.push([colA.values[i], colB.values[i]]);
                    }
                    option = {
                        tooltip: { trigger: 'item', backgroundColor: '#1e293b', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 13 }, padding: [12, 16] },
                        grid: { top: 30, right: 30, bottom: 50, left: 60 },
                        xAxis: { type: 'value', name: colA.name, nameTextStyle: { color: '#64748b', fontSize: 13, padding: [10, 0, 0, 0] }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b' }, axisTick: { show: false } },
                        yAxis: { type: 'value', name: colB.name, nameTextStyle: { color: '#64748b', fontSize: 13 }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#64748b' } },
                        series: [{ type: 'scatter', data: scatterData, symbolSize: 14, itemStyle: { color: color, borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(37, 99, 235, 0.3)' }, animationDuration: 800, animationEasing: 'cubicOut' }]
                    };
                } else {
                    option = {
                        title: { text: '需要至少两列数值型数据\n才能绘制散点图', left: 'center', top: 'center', textStyle: { color: '#94a3b8', fontSize: 14, lineHeight: 24 } }
                    };
                }
            }

            if (type === 'box') {
                // 箱线图：显示各数值列的五数概括
                if (numericCols.length >= 1) {
                    var boxData = numericCols.map(function(col) {
                        var vals = col.values.slice().sort(function(a, b) { return a - b; });
                        var n = vals.length;
                        var q1 = vals[Math.floor(n / 4)];
                        var q3 = vals[Math.floor(n * 3 / 4)];
                        var iqr = q3 - q1;
                        var lower = Math.max(vals[0], q1 - 1.5 * iqr);
                        var upper = Math.min(vals[n - 1], q3 + 1.5 * iqr);
                        var outliers = col.values.filter(function(v) { return v < lower || v > upper; });
                        return {
                            name: col.name,
                            min: vals[0],
                            q1: q1,
                            median: colStats[col.name].median,
                            q3: q3,
                            max: vals[n - 1],
                            outliers: outliers
                        };
                    });
                    option = {
                        tooltip: {
                            trigger: 'item',
                            backgroundColor: '#1e293b',
                            borderColor: 'transparent',
                            textStyle: { color: '#fff', fontSize: 13 },
                            padding: [12, 16],
                            formatter: function(p) {
                                if (p.seriesType === 'boxplot') {
                                    var d = boxData[p.dataIndex];
                                    return '<b>' + d.name + '</b><br/>' +
                                        '最大值: ' + d.max.toFixed(3) + '<br/>' +
                                        '上四分位(Q3): ' + d.q3.toFixed(3) + '<br/>' +
                                        '中位数: ' + d.median.toFixed(3) + '<br/>' +
                                        '下四分位(Q1): ' + d.q1.toFixed(3) + '<br/>' +
                                        '最小值: ' + d.min.toFixed(3) +
                                        (d.outliers.length > 0 ? '<br/>离群点: ' + d.outliers.length + '个' : '');
                                }
                                return '';
                            }
                        },
                        grid: { top: 30, right: 30, bottom: 60, left: 60 },
                        xAxis: {
                            type: 'category',
                            data: boxData.map(function(d) { return d.name; }),
                            axisLine: { lineStyle: { color: '#e2e8f0' } },
                            axisLabel: { color: '#64748b', rotate: numericCols.length > 4 ? 20 : 0 },
                            axisTick: { show: false }
                        },
                        yAxis: {
                            type: 'value',
                            splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                            axisLabel: { color: '#64748b' },
                            axisLine: { show: false },
                            axisTick: { show: false }
                        },
                        series: [{
                            type: 'boxplot',
                            data: boxData.map(function(d, idx) {
                                return [d.min, d.q1, d.median, d.q3, d.max];
                            }),
                            itemStyle: {
                                color: '#2563eb',
                                borderColor: '#2563eb',
                                borderWidth: 2
                            },
                            boxWidth: ['30%', '50%'],
                            animationDuration: 1000,
                            animationEasing: 'cubicOut'
                        }]
                    };
                    // 如果有离群点，添加散点图层
                    var hasOutliers = boxData.some(function(d) { return d.outliers.length > 0; });
                    if (hasOutliers) {
                        var outlierData = [];
                        boxData.forEach(function(d, idx) {
                            d.outliers.forEach(function(v) {
                                outlierData.push([idx, v]);
                            });
                        });
                        option.series.push({
                            type: 'scatter',
                            data: outlierData,
                            symbolSize: 8,
                            itemStyle: { color: '#ef4444', borderColor: '#fff', borderWidth: 1 },
                            tooltip: {
                                formatter: function(p) {
                                    return '离群值: ' + p.value[1].toFixed(3);
                                }
                            }
                        });
                    }
                } else {
                    option = {
                        title: { text: '需要至少一列数值型数据\n才能绘制箱线图', left: 'center', top: 'center', textStyle: { color: '#94a3b8', fontSize: 14, lineHeight: 24 } }
                    };
                }
            }

            chart.setOption(option, true);
        }

        // ===== 初始化 =====
        /**
         * 页面初始化入口：从 localStorage 读取数据，执行处理、概览更新、图表初始化和 AI 分析
         */
        function init() {
            const dataStr = localStorage.getItem('labmate_raw_data');
            if (!dataStr) {
                document.getElementById('pageSubtitle').textContent = '暂无数据，请先上传文件';
                document.getElementById('overviewRows').textContent = '0';
                document.getElementById('overviewCols').textContent = '0';
                document.getElementById('overviewType').textContent = '0';
                document.getElementById('overviewSize').textContent = '--';
                document.getElementById('aiLoading').style.display = 'none';
                document.getElementById('aiSec_type').style.display = '';
                document.getElementById('aiBody_type').innerHTML = '暂无数据，请先 <a href="../页面/upload.html" style="color:#2563eb;text-decoration:none;font-weight:600;">上传数据</a>';
                return;
            }

            try {
                rawData = JSON.parse(dataStr);
                processData();
                updateOverview();
                initChart();
                generateConclusions();
            } catch (e) {
                console.error(e);
                document.getElementById('pageSubtitle').textContent = '数据解析出错，请重新上传';
            }
        }

        document.addEventListener('DOMContentLoaded', init);