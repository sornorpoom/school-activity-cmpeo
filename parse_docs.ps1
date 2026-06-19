# parse_docs.ps1 - Parses all lesson plan DOC files to extract curriculum data

$docsPath = "d:\OneDrive\Desktop\Gravity\School Map\Formatted_Docs"
$outputPath = "d:\OneDrive\Desktop\Gravity\School Map 2\curriculum_data.js"

$files = Get-ChildItem -Path $docsPath -Filter "*.doc"
$dataMap = @{}

Write-Host "Found $($files.Count) DOC files to parse."

foreach ($file in $files) {
    $filename = $file.BaseName
    
    # Split filename: [ACTIVITY] - [GRADE] - [TEACHER]
    $parts = $filename -split '\s*-\s*'
    if ($parts.Count -lt 3) {
        Write-Host "Skipping invalid filename: $filename"
        continue
    }
    
    $activity = $parts[0].Trim()
    $grade = $parts[1].Trim()
    $teacher = $parts[2].Trim()
    
    # Normalize keys for matching
    $cleanTeacher = $teacher -replace '\s+', ''
    $cleanActivity = $activity -replace '\s+', ''
    $cleanGrade = $grade -replace '\s+', ''
    $key = "${cleanTeacher}_${cleanGrade}_${cleanActivity}"
    
    $html = Get-Content $file.FullName -Raw
    $decodedHtml = [System.Net.WebUtility]::HtmlDecode($html)
    
    # Strip style blocks content to prevent CSS properties from cluttering plain text
    $cleanedHtml = $decodedHtml -replace '(?s)<style[^>]*>.*?</style>', ''
    $plainText = $cleanedHtml -replace '<[^>]+>', ' ' -replace '\s+', ' '
    
    # Extract Big Idea (concept)
    $concept = ""
    if ($plainText -match 'แนวคิดหลัก\s*\(Big\s+Idea\)\s*:\s*(.*?)(?=\s*(เป้าหมายสมรรถนะ|ระยะที่|ขั้นตอนที่|แบบประเมิน|\z))') {
        $concept = $Matches[1].Trim()
        $concept = $concept -replace '\s*•\s*$', ''
    }
    
    # Extract Active Learning steps (Planning, Action, Reflection)
    $step1 = ""
    if ($plainText -match 'ระยะที่\s*1\s*:\s*.*?กิจกรรมปฏิบัติ\s*:\s*(.*?)(?=\s*(ระยะที่\s*2|ขั้นตอนที่|แบบประเมิน|ชุดที่|\z))') {
        $step1 = $Matches[1].Trim() -replace '\s*•\s*$', ''
    }
    $step2 = ""
    if ($plainText -match 'ระยะที่\s*2\s*:\s*.*?กิจกรรมปฏิบัติ\s*:\s*(.*?)(?=\s*(ระยะที่\s*3|ขั้นตอนที่|แบบประเมิน|ชุดที่|\z))') {
        $step2 = $Matches[1].Trim() -replace '\s*•\s*$', ''
    }
    $step3 = ""
    if ($plainText -match 'ระยะที่\s*3\s*:\s*.*?กิจกรรมปฏิบัติ\s*:\s*(.*?)(?=\s*(ขั้นตอนที่|แบบประเมิน|ชุดที่|\z))') {
        $step3 = $Matches[1].Trim() -replace '\s*•\s*$', ''
    }
    
    # Extract Indicators from Table index 1
    $tables = [regex]::Matches($decodedHtml, '(?s)<table[^>]*>(.*?)</table>')
    $indicators = @{}
    
    if ($tables.Count -ge 2) {
        $indTable = $tables[1].Groups[1].Value
        $rows = [regex]::Matches($indTable, '(?s)<tr[^>]*>(.*?)</tr>')
        
        for ($i = 1; $i -lt $rows.Count; $i++) {
            $row = $rows[$i].Groups[1].Value
            $cells = [regex]::Matches($row, '(?s)<td[^>]*>(.*?)</td>')
            if ($cells.Count -ge 3) {
                $subjNameRaw = [System.Net.WebUtility]::HtmlDecode($cells[0].Groups[1].Value) -replace '<[^>]+>', ' ' -replace '\s+', ' ' -replace '^\d+\.\s*', '' -replace '^\s+|\s+$', ''
                $between = [System.Net.WebUtility]::HtmlDecode($cells[1].Groups[1].Value) -replace '<[^>]+>', ' ' -replace '\s+', ' ' -replace '^\s+|\s+$', ''
                $end = [System.Net.WebUtility]::HtmlDecode($cells[2].Groups[1].Value) -replace '<[^>]+>', ' ' -replace '\s+', ' ' -replace '^\s+|\s+$', ''
                
                # Standardize Subject Name
                $subjKey = ""
                if ($subjNameRaw -match "ภาษาไทย") { $subjKey = "thai" }
                elseif ($subjNameRaw -match "คณิตศาสตร์") { $subjKey = "math" }
                elseif ($subjNameRaw -match "วิทยาศาสตร์") { $subjKey = "science" }
                elseif ($subjNameRaw -match "สังคมศึกษา") { $subjKey = "social" }
                elseif ($subjNameRaw -match "สุขศึกษา") { $subjKey = "health" }
                elseif ($subjNameRaw -match "ศิลปะ") { $subjKey = "art" }
                elseif ($subjNameRaw -match "การงานอาชีพ") { $subjKey = "career" }
                elseif ($subjNameRaw -match "ภาษาต่างประเทศ") { $subjKey = "foreign" }
                
                if ($subjKey -ne "") {
                    $indicators[$subjKey] = @{
                        subject = $subjNameRaw
                        between = $between
                        end = $end
                    }
                }
            }
        }
    }
    
    # Extract Objectives from Table 2, 3, 4 (ດີเยี่ยม / Level 4 column)
    $objectives = @()
    for ($tIdx = 2; $tIdx -lt [Math]::Min($tables.Count, 5); $tIdx++) {
        $rubTable = $tables[$tIdx].Groups[1].Value
        $rRows = [regex]::Matches($rubTable, '(?s)<tr[^>]*>(.*?)</tr>')
        
        for ($rIdx = 1; $rIdx -lt $rRows.Count; $rIdx++) {
            $rRow = $rRows[$rIdx].Groups[1].Value
            $rCells = [regex]::Matches($rRow, '(?s)<td[^>]*>(.*?)</td>')
            
            if ($rCells.Count -ge 2) {
                $desc = [System.Net.WebUtility]::HtmlDecode($rCells[1].Groups[1].Value) -replace '<[^>]+>', ' ' -replace '\s+', ' ' -replace '^\s+|\s+$', ''
                if ($desc -ne "") {
                    $objectives += $desc
                }
            }
        }
    }
    
    $dataMap[$key] = @{
        concept = $concept
        indicators = $indicators
        sequence = @($step1, $step2, $step3)
        objectives = $objectives
    }
}

# Convert dataMap to JSON and save as JS file
$json = ConvertTo-Json -InputObject $dataMap -Depth 10
"const CURRICULUM_DATA = $json;" | Out-File $outputPath -Encoding utf8
Write-Host "Successfully parsed $($dataMap.Count) documents and saved to curriculum_data.js!"