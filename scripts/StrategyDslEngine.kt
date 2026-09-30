package scripts

import java.io.File

class StrategyDsl {
    var name: String = ""
    var symbol: String = ""
    var buyTrigger: String = ""
    var sellTrigger: String = ""
    var stopLoss: Double = 0.0
    var takeProfit: Double = 0.0

    fun name(value: String) { name = value }
    fun symbol(value: String) { symbol = value }
    fun buyTrigger(value: String) { buyTrigger = value }
    fun sellTrigger(value: String) { sellTrigger = value }
    fun stopLoss(value: Double) { stopLoss = value }
    fun takeProfit(value: Double) { takeProfit = value }

    fun evaluateBuy(price: Double): Boolean {
        if (buyTrigger.contains(">")) {
            val target = buyTrigger.substringAfter(">").trim().toDoubleOrNull() ?: return false
            return price > target
        } else if (buyTrigger.contains("<")) {
            val target = buyTrigger.substringAfter("<").trim().toDoubleOrNull() ?: return false
            return price < target
        }
        return false
    }

    fun evaluateSell(price: Double): Boolean {
        if (sellTrigger.contains(">")) {
            val target = sellTrigger.substringAfter(">").trim().toDoubleOrNull() ?: return false
            return price > target
        } else if (sellTrigger.contains("<")) {
            val target = sellTrigger.substringAfter("<").trim().toDoubleOrNull() ?: return false
            return price < target
        }
        return false
    }
}

class StrategyDslEngine {
    fun loadStrategyFromScript(file: File): StrategyDsl {
        val dsl = StrategyDsl()
        val lines = file.readLines()
        
        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.startsWith("strategy(") || trimmed.startsWith("strategy ")) {
                val nameVal = trimmed.substringAfter("strategy(\"").substringBefore("\")")
                    .substringAfter("strategy \"").substringBefore("\"")
                dsl.name = nameVal
            } else if (trimmed.startsWith("symbol(") || trimmed.startsWith("symbol ")) {
                val symVal = trimmed.substringAfter("symbol(\"").substringBefore("\")")
                    .substringAfter("symbol \"").substringBefore("\"")
                dsl.symbol = symVal
            } else if (trimmed.startsWith("buyTrigger(") || trimmed.startsWith("buyTrigger ")) {
                val triggerVal = trimmed.substringAfter("buyTrigger(\"").substringBefore("\")")
                    .substringAfter("buyTrigger \"").substringBefore("\"")
                dsl.buyTrigger = triggerVal
            } else if (trimmed.startsWith("sellTrigger(") || trimmed.startsWith("sellTrigger ")) {
                val triggerVal = trimmed.substringAfter("sellTrigger(\"").substringBefore("\")")
                    .substringAfter("sellTrigger \"").substringBefore("\"")
                dsl.sellTrigger = triggerVal
            } else if (trimmed.startsWith("stopLoss(") || trimmed.startsWith("stopLoss ")) {
                val slVal = trimmed.substringAfter("stopLoss(").substringBefore(")")
                    .substringAfter("stopLoss ").trim().toDoubleOrNull() ?: 0.0
                dsl.stopLoss = slVal
            } else if (trimmed.startsWith("takeProfit(") || trimmed.startsWith("takeProfit ")) {
                val tpVal = trimmed.substringAfter("takeProfit(").substringBefore(")")
                    .substringAfter("takeProfit ").trim().toDoubleOrNull() ?: 0.0
                dsl.takeProfit = tpVal
            }
        }
        return dsl
    }
}
