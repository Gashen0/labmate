/**
 * 从 templates.json 加载模板数据
 */
async function loadTemplates() {
    try {
        const resp = await fetch('../数据/templates.json');
        TEMPLATES = await resp.json();
    } catch (e) {
        console.warn('模板数据加载失败:', e);
        TEMPLATES = {};
    }
}
loadTemplates();

        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadDefault = document.getElementById('uploadDefault');
        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');
        const fileSuccess = document.getElementById('fileSuccess');
        const progressWrapper = document.getElementById('progressWrapper');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const reuploadBtn = document.getElementById('reuploadBtn');
        const nextBtn = document.getElementById('nextBtn');

        let currentFile = null;
        let allSheets = {};       // { sheetName: jsonData }
        let activeSheet = null;
        let currentExt = '';

        const ALLOWED_TYPES = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv'
        ];
        const ALLOWED_EXT = ['.xlsx', '.xls', '.csv'];

        // 点击上传区域打开文件选择
        uploadArea.addEventListener('click', function(e) {
            if (uploadArea.classList.contains('has-file') && e.target !== reuploadBtn && !reuploadBtn.contains(e.target)) return;
            if (e.target === reuploadBtn || reuploadBtn.contains(e.target)) return;
            fileInput.click();
        });

        // 重新上传
        reuploadBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            resetUpload();
            setTimeout(() => fileInput.click(), 100);
        });

        // 文件选择
        fileInput.addEventListener('change', function() {
            if (fileInput.files.length > 0) {
                handleFile(fileInput.files[0]);
            }
        });

        // 拖拽事件
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });

        /**
         * 处理用户选择或拖拽的文件，验证格式后开始解析
         * @param {File} file - 用户上传的文件对象
         */
        function handleFile(file) {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (!ALLOWED_EXT.includes(ext)) {
                showToast('请上传 Excel 或 CSV 格式的文件', 'error');
                return;
            }
            currentFile = file;
            currentExt = ext;

            // 显示文件信息
            uploadDefault.style.display = 'none';
            fileInfo.classList.add('visible');
            fileName.textContent = file.name;
            fileSize.textContent = formatSize(file.size);
            uploadArea.classList.add('has-file');

            // 隐藏旧预览
            document.getElementById('sheetSelector').classList.remove('visible');
            document.getElementById('dataPreview').classList.remove('visible');

            // 开始解析
            progressWrapper.classList.add('visible');
            fileSuccess.classList.remove('visible');
            nextBtn.classList.remove('active');
            parseAndUpload(file, ext);
        }

        /**
         * 模拟进度条动画并解析上传的文件内容
         * @param {File} file - 要解析的文件对象
         * @param {string} ext - 文件扩展名（如 '.xlsx'、'.csv'）
         */
        function parseAndUpload(file, ext) {
            let progress = 0;
            progressBar.classList.remove('complete');
            progressBar.style.width = '0%';
            progressText.textContent = '0%';

            const readInterval = setInterval(function() {
                const increment = Math.random() * 12 + 5;
                progress = Math.min(progress + increment, 50);
                progressBar.style.width = progress + '%';
                progressText.textContent = Math.round(progress) + '%';

                if (progress >= 50) {
                    clearInterval(readInterval);
                    progressText.textContent = '正在解析数据...';
                    doParse(file, ext);
                }
            }, 100);

            /**
             * 读取文件并使用 SheetJS 解析为二维数组数据
             * @param {File} file - 要读取的文件对象
             * @param {string} ext - 文件扩展名
             */
            function doParse(file, ext) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        var workbook;
                        if (ext === '.csv') {
                            var text = e.target.result;
                            workbook = XLSX.read(text, { type: 'string' });
                        } else {
                            var data = new Uint8Array(e.target.result);
                            workbook = XLSX.read(data, { type: 'array' });
                        }

                        // 解析所有 Sheet
                        allSheets = {};
                        var sheetNames = workbook.SheetNames;
                        sheetNames.forEach(function(name) {
                            var sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
                            allSheets[name] = sheetData;
                        });

                        // 默认选第一个 Sheet
                        activeSheet = sheetNames[0];
                        var jsonData = allSheets[activeSheet];

                        // 存储到 localStorage
                        saveToStorage(jsonData, file);

                        // 阶段2：进度动画 (50% -> 100%)
                        var parseProgress = 50;
                        var parseInterval = setInterval(function() {
                            var inc = Math.random() * 15 + 8;
                            parseProgress = Math.min(parseProgress + inc, 100);
                            progressBar.style.width = parseProgress + '%';
                            progressText.textContent = Math.round(parseProgress) + '%';

                            if (parseProgress >= 100) {
                                clearInterval(parseInterval);
                                progressBar.classList.add('complete');
                                progressText.textContent = '解析完成';

                                setTimeout(function() {
                                    fileSuccess.classList.add('visible');
                                    reuploadBtn.classList.add('visible');
                                    nextBtn.classList.add('active');

                                    // 多Sheet选择器
                                    if (sheetNames.length > 1) {
                                        renderSheetSelector(sheetNames);
                                    }

                                    // 数据预览
                                    renderPreview(jsonData);

                                    var msg = '数据解析成功，共 ' + Math.max(0, jsonData.length - 1) + ' 行数据';
                                    if (sheetNames.length > 1) msg += '（' + sheetNames.length + ' 个工作表）';
                                    showToast(msg, '');
                                }, 300);
                            }
                        }, 80);
                    } catch (err) {
                        console.error('解析失败:', err);
                        progressText.textContent = '解析失败';
                        progressBar.style.background = '#dc2626';
                        showToast('文件解析失败，请检查文件格式是否正确', 'error');
                        setTimeout(function() { resetUpload(); }, 2000);
                    }
                };

                reader.onerror = function() {
                    progressText.textContent = '读取失败';
                    showToast('文件读取失败', 'error');
                    setTimeout(function() { resetUpload(); }, 2000);
                };

                if (ext === '.csv') {
                    reader.readAsText(file);
                } else {
                    reader.readAsArrayBuffer(file);
                }
            }
        }

        // ===== Sheet 选择器 =====

        /**
         * 渲染多工作表选择器的标签页
         * @param {string[]} sheetNames - 工作表名称数组
         */
        function renderSheetSelector(sheetNames) {
            var tabs = document.getElementById('sheetTabs');
            tabs.innerHTML = sheetNames.map(function(name, idx) {
                var rows = Math.max(0, allSheets[name].length - 1);
                return '<button class="sheet-tab' + (idx === 0 ? ' active' : '') + '" data-sheet="' + name + '" onclick="switchSheet(\'' + name.replace(/'/g, "\\'") + '\')">' + name + '<span class="sheet-rows">(' + rows + '行)</span></button>';
            }).join('');
            document.getElementById('sheetSelector').classList.add('visible');
        }

        /**
         * 切换当前活跃的工作表并更新预览和存储
         * @param {string} sheetName - 要切换到的工作表名称
         */
        function switchSheet(sheetName) {
            activeSheet = sheetName;
            // 更新 tab 样式
            document.querySelectorAll('.sheet-tab').forEach(function(tab) {
                tab.classList.toggle('active', tab.dataset.sheet === sheetName);
            });
            // 更新预览
            var jsonData = allSheets[sheetName];
            renderPreview(jsonData);
            // 更新存储
            saveToStorage(jsonData, currentFile);
            showToast('已切换到「' + sheetName + '」', '');
        }

        // ===== 数据预览 =====

        /**
         * 渲染数据预览表格，最多显示前15行数据
         * @param {Array[]} jsonData - 二维数组形式的表格数据，第一行为表头
         */
        function renderPreview(jsonData) {
            var preview = document.getElementById('dataPreview');
            var thead = document.querySelector('#dataTable thead');
            var tbody = document.querySelector('#dataTable tbody');
            var hint = document.getElementById('previewHint');

            var headers = jsonData[0] || [];
            var dataRows = jsonData.slice(1);
            var previewRows = dataRows.slice(0, 15); // 最多预览15行

            // 表头
            thead.innerHTML = '<tr><th style="min-width:36px;text-align:center;">#</th>' + headers.map(function(h) {
                return '<th>' + (h || '列' + (headers.indexOf(h) + 1)) + '</th>';
            }).join('') + '</tr>';

            // 数据行
            tbody.innerHTML = previewRows.map(function(row, ri) {
                return '<tr><td class="row-num">' + (ri + 1) + '</td>' + headers.map(function(_, ci) {
                    var val = row[ci] !== undefined ? row[ci] : '';
                    return '<td>' + val + '</td>';
                }).join('') + '</tr>';
            }).join('');

            hint.textContent = '显示前 ' + previewRows.length + ' 行，共 ' + dataRows.length + ' 行数据';
            preview.classList.add('visible');
        }

        /**
         * 将解析后的数据和文件信息保存到 localStorage
         * @param {Array[]} jsonData - 二维数组形式的表格数据
         * @param {File} file - 上传的文件对象，用于获取文件名和大小
         */
        function saveToStorage(jsonData, file) {
            localStorage.setItem('labmate_raw_data', JSON.stringify(jsonData));
            localStorage.setItem('labmate_filename', file.name);
            localStorage.setItem('labmate_filesize', formatSize(file.size));
            localStorage.setItem('labmate_upload_time', new Date().toISOString());
            if (activeSheet) {
                localStorage.setItem('labmate_sheet_name', activeSheet);
            }
        }

        /**
         * 重置上传区域到初始状态，清除所有数据和 localStorage
         */
        function resetUpload() {
            uploadDefault.style.display = '';
            fileInfo.classList.remove('visible');
            fileSuccess.classList.remove('visible');
            progressWrapper.classList.remove('visible');
            reuploadBtn.classList.remove('visible');
            uploadArea.classList.remove('has-file');
            nextBtn.classList.remove('active');
            fileInput.value = '';
            progressBar.style.width = '0%';
            progressBar.style.background = '';
            document.getElementById('sheetSelector').classList.remove('visible');
            document.getElementById('dataPreview').classList.remove('visible');
            allSheets = {};
            activeSheet = null;
            // 清除 localStorage
            localStorage.removeItem('labmate_raw_data');
            localStorage.removeItem('labmate_filename');
            localStorage.removeItem('labmate_filesize');
            localStorage.removeItem('labmate_upload_time');
            localStorage.removeItem('labmate_stats');
            localStorage.removeItem('labmate_ai_conclusions');
        }

        /**
         * 将字节数格式化为人类可读的文件大小字符串
         * @param {number} bytes - 文件大小（字节数）
         * @returns {string} 格式化后的文件大小，如 "1.5 MB"
         */
        function formatSize(bytes) {
            if (bytes === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
        }

        /**
         * 点击"下一步"按钮，跳转到分析页面
         */
        function goNext() {
            if (!nextBtn.classList.contains('active')) return;
            window.location.href = 'analysis.html';
        }

        var TEMPLATES = null;

        /**
         * 加载预置的实验模板数据，模拟上传流程并显示预览
         * @param {string} templateId - 模板标识符，对应 TEMPLATES 中的键名
         */
        function loadTemplate(templateId) {
            var template = TEMPLATES[templateId];
            if (!template) return;

            // 更新选中状态
            document.querySelectorAll('.template-card').forEach(function(card) {
                card.classList.toggle('selected', card.dataset.template === templateId);
            });

            // 模拟加载进度
            var data = template.data;
            var progress = 0;
            uploadDefault.style.display = 'none';
            fileInfo.classList.add('visible');
            fileName.textContent = template.name + '.csv';
            fileSize.textContent = '模板数据';
            uploadArea.classList.add('has-file');
            progressWrapper.classList.add('visible');
            fileSuccess.classList.remove('visible');
            nextBtn.classList.remove('active');
            progressBar.classList.remove('complete');
            progressBar.style.width = '0%';

            var progressInterval = setInterval(function() {
                progress += Math.random() * 20 + 10;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(progressInterval);
                    progressBar.style.width = '100%';
                    progressBar.classList.add('complete');
                    progressText.textContent = '模板加载完成';

                    setTimeout(function() {
                        fileSuccess.classList.add('visible');
                        reuploadBtn.classList.add('visible');
                        nextBtn.classList.add('active');

                        // 存储模板数据
                        allSheets = {};
                        allSheets[template.name] = data;
                        activeSheet = template.name;
                        saveToStorage(data, { name: template.name + '.csv' });

                        // 显示预览
                        document.getElementById('sheetSelector').classList.remove('visible');
                        renderPreview(data);

                        showToast('模板「' + template.name + '」已加载，共 ' + (data.length - 1) + ' 行数据', '');
                    }, 300);
                } else {
                    progressBar.style.width = progress + '%';
                    progressText.textContent = '加载模板中...';
                }
            }, 80);
        }

        // Toast 提示

        /**
         * 显示 Toast 提示消息，3秒后自动消失
         * @param {string} msg - 提示文本内容
         * @param {string} [type=''] - 提示类型，传 'error' 显示红色错误样式，空字符串为默认样式
         */
        function showToast(msg, type = '') {
            const toast = document.getElementById('toast');
            const toastMsg = document.getElementById('toastMsg');
            toastMsg.textContent = msg;
            toast.className = 'toast' + (type ? ' ' + type : '');
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }