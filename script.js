(() => {
  "use strict";

  const API_URL = "https://open.neis.go.kr/hub/mealServiceDietInfo";
  const SCHOOL = { officeCode: "C10", schoolCode: "1421117" };
  const MEAL_NAMES = { "1": "조식", "2": "중식", "3": "석식" };
  const ALLERGENS = {
    "1": "난류", "2": "우유", "3": "메밀", "4": "땅콩", "5": "대두", "6": "밀",
    "7": "고등어", "8": "게", "9": "새우", "10": "돼지고기", "11": "복숭아",
    "12": "토마토", "13": "아황산류", "14": "호두", "15": "닭고기", "16": "쇠고기",
    "17": "오징어", "18": "조개류"
  };

  const dateInput = document.getElementById("mealDate");
  const tabs = document.getElementById("mealTabs");
  const status = document.getElementById("mealStatus");
  const content = document.getElementById("mealContent");
  const card = document.querySelector(".meal-card");
  const cache = new Map();
  let activeMealCode = "2";
  let requestId = 0;

  const pad = (n) => String(n).padStart(2, "0");
  const asYmd = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseYmd = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const splitLines = (value) => String(value || "").split(/<br\s*\/?>/i).map((line) => line.trim()).filter(Boolean);

  function setStatus(message, isError = false) {
    card.setAttribute("aria-busy", "false");
    status.hidden = false;
    status.classList.toggle("error", isError);
    status.textContent = message;
    content.hidden = true;
    tabs.hidden = true;
  }

  function loading() {
    card.setAttribute("aria-busy", "true");
    status.hidden = false;
    status.classList.remove("error");
    status.textContent = "급식 정보를 불러오는 중입니다…";
    content.hidden = true;
    tabs.hidden = true;
  }

  function parseDish(line) {
    const match = line.match(/^(.*?)\s*\(([\d.]+)\)\s*$/);
    if (!match) return { name: line, allergens: [] };
    return {
      name: match[1],
      allergens: match[2].split(".").map((number) => ALLERGENS[number]).filter(Boolean)
    };
  }

  function displayLines(element, lines) {
    element.innerHTML = `<div class="extra-lines">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>`;
    element.closest("details").hidden = lines.length === 0;
  }

  function renderMeals(rows) {
    const meals = [...rows].sort((a, b) => Number(a.MMEAL_SC_CODE) - Number(b.MMEAL_SC_CODE));
    if (!meals.length) {
      setStatus("선택한 날짜에는 등록된 급식이 없습니다.");
      return;
    }

    if (!meals.some((meal) => meal.MMEAL_SC_CODE === activeMealCode)) {
      activeMealCode = meals.some((meal) => meal.MMEAL_SC_CODE === "2") ? "2" : meals[0].MMEAL_SC_CODE;
    }

    tabs.innerHTML = meals.map((meal) => {
      const code = String(meal.MMEAL_SC_CODE);
      const name = MEAL_NAMES[code] || meal.MMEAL_SC_NM || "급식";
      return `<button class="meal-tab${code === activeMealCode ? " active" : ""}" type="button" role="tab" aria-selected="${code === activeMealCode}" data-meal-code="${escapeHtml(code)}">${escapeHtml(name)}</button>`;
    }).join("");
    tabs.hidden = meals.length < 2;

    const meal = meals.find((item) => String(item.MMEAL_SC_CODE) === activeMealCode) || meals[0];
    const date = parseYmd(dateInput.value);
    const weekday = "일월화수목금토"[date.getDay()];
    document.getElementById("mealDateLabel").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
    document.getElementById("mealName").textContent = MEAL_NAMES[meal.MMEAL_SC_CODE] || meal.MMEAL_SC_NM || "급식";

    const calories = document.getElementById("calories");
    calories.textContent = meal.CAL_INFO || "열량 정보 없음";
    calories.hidden = !meal.CAL_INFO;

    const menuItems = splitLines(meal.DDISH_NM).map(parseDish);
    document.getElementById("menuList").innerHTML = menuItems.map((dish) => {
      const tags = dish.allergens.length
        ? `<span class="allergen-tags" aria-label="알레르기 유발 식품">${dish.allergens.map(escapeHtml).join(" · ")}</span>`
        : "";
      return `<li class="menu-item"><span class="dish-name">${escapeHtml(dish.name)}</span>${tags}</li>`;
    }).join("");

    const servings = Number(meal.MLSV_FGR);
    document.getElementById("mealServings").textContent = servings > 0 ? `예정 급식 인원 ${Math.round(servings).toLocaleString()}명` : "";
    displayLines(document.getElementById("nutritionInfo"), splitLines(meal.NTR_INFO));
    displayLines(document.getElementById("originInfo"), splitLines(meal.ORPLC_INFO));

    status.hidden = true;
    content.hidden = false;
    card.setAttribute("aria-busy", "false");
  }

  async function loadMeals() {
    if (!dateInput.value) return;
    const selectedDate = dateInput.value;
    const currentRequest = ++requestId;
    if (cache.has(selectedDate)) {
      renderMeals(cache.get(selectedDate));
      return;
    }

    loading();
    const params = new URLSearchParams({
      Type: "json",
      ATPT_OFCDC_SC_CODE: SCHOOL.officeCode,
      SD_SCHUL_CODE: SCHOOL.schoolCode,
      MLSV_YMD: selectedDate.replaceAll("-", "")
    });

    try {
      const response = await fetch(`${API_URL}?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (currentRequest !== requestId) return;

      const rows = data?.mealServiceDietInfo?.[1]?.row;
      if (Array.isArray(rows) && rows.length) {
        cache.set(selectedDate, rows);
        renderMeals(rows);
      } else if (data?.RESULT?.CODE === "INFO-200") {
        setStatus("선택한 날짜에는 등록된 급식이 없습니다. (주말·공휴일일 수 있어요.)");
      } else {
        setStatus(data?.RESULT?.MESSAGE || "급식 정보를 불러오지 못했습니다.", true);
      }
    } catch (error) {
      if (currentRequest !== requestId) return;
      setStatus("급식 정보를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.", true);
    }
  }

  function moveDate(amount) {
    const date = parseYmd(dateInput.value);
    date.setDate(date.getDate() + amount);
    dateInput.value = asYmd(date);
    loadMeals();
  }

  document.getElementById("previousDay").addEventListener("click", () => moveDate(-1));
  document.getElementById("nextDay").addEventListener("click", () => moveDate(1));
  document.getElementById("todayButton").addEventListener("click", () => {
    dateInput.value = asYmd(new Date());
    loadMeals();
  });
  dateInput.addEventListener("change", loadMeals);
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-meal-code]");
    if (!button) return;
    activeMealCode = button.dataset.mealCode;
    const rows = cache.get(dateInput.value);
    if (rows) renderMeals(rows);
  });

  dateInput.value = asYmd(new Date());
  loadMeals();
})();
