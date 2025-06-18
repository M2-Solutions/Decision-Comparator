import React, { useReducer } from 'react';
import { parseString } from 'xml2js';
import './App.css';

const checkCodeMapping = {
  'H218': 'CHED-PP HMI SMS',
  'H219': 'CHED-PP PHSI',
  'H220': 'CHED-PP HMI GMS',
  'H221': 'CHED-A',
  'H222': 'CHED-P (Non IUU)',
  'H223': 'CHED-D',
  'H224': 'CHED-P IUU',
};

function App() {
  const initialState = {
    jsonData: null,
    alvsData: null,
    btmsData: null,
    parsedBtmsData: null,
    comparisonResults: [],
    error: null,
    jsonText: '',
    id: null,
  };

  const reducer = (state, action) => {
    switch (action.type) {
      case 'SET_JSON_DATA':
        return { ...state, jsonData: action.payload };
      case 'SET_ALVS_DATA':
        return { ...state, alvsData: action.payload };
      case 'SET_BTMS_DATA':
        return { ...state, btmsData: action.payload };
      case 'SET_PARSED_BTMS_DATA':
        return { ...state, parsedBtmsData: action.payload };
      case 'SET_COMPARISON_RESULTS':
        return { ...state, comparisonResults: action.payload };
      case 'SET_ERROR':
        return { ...state, error: action.payload };
      case 'SET_JSON_TEXT':
        return { ...state, jsonText: action.payload };
      case 'SET_ID':
       return { ...state, id: action.payload };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const { comparisonResults, error, jsonText, id } = state;

  const handleError = (message) => {
    dispatch({ type: 'SET_ERROR', payload: message });
  };

  const handleJsonTextChange = (event) => {
    dispatch({ type: 'SET_JSON_TEXT', payload: event.target.value });
  };

  const handleParseJson = () => {
    try {
      const data = JSON.parse(jsonText);
      dispatch({ type: 'SET_JSON_DATA', payload: data });
      dispatch({ type: 'SET_ID', payload: data.id });

      parseString(data.latest.alvsXml, (err, result) => {
        if (err) {
          handleError("Error parsing ALVS XML: " + err.message);
          return;
        }
        dispatch({ type: 'SET_ALVS_DATA', payload: result });

        parseString(data.latest.btmsXml, (err, btmsResult) => {
          if (err) {
            handleError("Error parsing BTMS XML: " + err.message);
            return;
          }
          dispatch({ type: 'SET_BTMS_DATA', payload: btmsResult });

          const results = compareData(result, btmsResult);
          dispatch({ type: 'SET_COMPARISON_RESULTS', payload: results });
        });
      });
    } catch (err) {
      handleError("Error parsing JSON: " + err.message);
    }
  };

  const setId = (id) => {
   dispatch({ type: 'SET_ID', payload: id });
  };

  const getCode = (item, codeType, isAlvs = true) => {
    const checkKey = isAlvs ? 'Check' : 'NS2:Check';
    const codeKey = isAlvs ? codeType : `NS2:${codeType}`;

    const check = item[checkKey] && item[checkKey][0];
    if (!check) {
      return 'N/A';
    }

    const code = check[codeKey] && check[codeKey][0];
    const checkCode = code || 'N/A';
    return `${checkCode} - ${checkCodeMapping[checkCode] || 'N/A'}`;
  };

  const compareData = (alvs, btms) => {
    const alvsItems = alvs['soap:Envelope']['soap:Body'][0]['DecisionNotification'][0]['DecisionNotification'][0]['Item'];
    let results = [];

    parseString(btms['NS1:Envelope']['NS1:Body'][0]['NS3:DecisionNotification'][0]['_'], (err, parsedBtms) => {
      if (err) {
        console.error("Error parsing inner BTMS XML:", err);
        return;
      }
      const btmsItems = parsedBtms['NS2:DecisionNotification']['NS2:Item'];

      if (alvsItems && btmsItems) {
        alvsItems.forEach((alvsItem) => {
          const itemNumber = alvsItem.ItemNumber ? alvsItem.ItemNumber[0] : 'N/A';
          const alvsCheckCode = getCode(alvsItem, 'CheckCode', true);
          const alvsDecisionCode = alvsItem.Check && alvsItem.Check[0] && alvsItem.Check[0].DecisionCode ? alvsItem.Check[0].DecisionCode[0] : 'N/A';

          let btmsItem = null;
          if (btmsItems) {
            btmsItem = btmsItems.find((btmsItem) => btmsItem['NS2:ItemNumber'] && btmsItem['NS2:ItemNumber'][0] === itemNumber);

            let btmsCheckCode = 'N/A';
            let btmsDecisionCode = 'N/A';
            let match = false;

            if (btmsItem) {
              btmsCheckCode = getCode(btmsItem, 'CheckCode', false);
              btmsDecisionCode = btmsItem['NS2:Check'] && btmsItem['NS2:Check'][0] && btmsItem['NS2:Check'][0]['NS2:DecisionCode'] ? btmsItem['NS2:Check'][0]['NS2:DecisionCode'][0] : 'N/A';
              match = alvsDecisionCode === btmsDecisionCode;
            }

            results.push({
              itemNumber: itemNumber,
              alvsCheckCode: alvsCheckCode,
              alvsDecisionCode: alvsDecisionCode,
              btmsCheckCode: btmsCheckCode,
              btmsDecisionCode: btmsDecisionCode,
              match: match,
            });
          } else {
            results.push({
              itemNumber: itemNumber,
              alvsCheckCode: alvsCheckCode,
              alvsDecisionCode: alvsDecisionCode,
              btmsCheckCode: 'N/A',
              btmsDecisionCode: 'N/A',
              match: false,
            });
          }
        });
      }
      dispatch({ type: 'SET_COMPARISON_RESULTS', payload: results });
      console.log("results:", results);
    });

    return results;
  };

  return (
    <div className="App">
      <h1>Decision Comparator</h1>
      
      <textarea
        rows="20"
        cols="50"
        placeholder="Paste JSON here"
        value={jsonText}
        onChange={handleJsonTextChange}
      />
      {error && <p className="error">{error}</p>}
      <div style={{textAlign: 'center', marginBottom: '20px'}}>
        <button onClick={handleParseJson}>Compare</button>
        <button onClick={clearAll}>Clear</button>
      </div>
      
      {comparisonResults.length > 0 && (
        <div>
          <h2>Comparison Results for {id}</h2>
          <table>
          <thead>
            <tr>
              <th>Item Number</th>
              <th>ALVS Check Code</th>
              <th>ALVS Decision Code</th>
              <th>BTMS Check Code</th>
              <th>BTMS Decision Code</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {comparisonResults.map((result, index) => (
              <tr key={index}>
                <td>{result.itemNumber}</td>
                <td>{result.alvsCheckCode}</td>
                <td>{result.alvsDecisionCode}</td>
                <td>{result.btmsCheckCode}</td>
                <td>{result.btmsDecisionCode}</td>
                <td className={result.match ? 'match-true' : 'match-false'}>{result.match ? 'True' : 'False'}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );

  function clearAll() {
    dispatch({ type: 'SET_JSON_TEXT', payload: '' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_COMPARISON_RESULTS', payload: [] });
  }
}

export default App;
